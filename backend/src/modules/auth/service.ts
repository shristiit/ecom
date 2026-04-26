import { Request, Response } from 'express';
import { z } from 'zod';
import fetch from 'node-fetch';
import crypto from 'node:crypto';
import { pool, query } from '@backend/db/pool.js';
import { signAccessToken, signRefreshToken, verifyToken } from '@backend/utils/jwt.js';
import {
  buildTenantBillingSummary,
  ensureTenantControlPlane,
  getTenantControlState,
  recordTenantAuditEvent,
  resolvePlanDefinition,
} from '@backend/modules/platform/control-plane.js';
import {
  SSO_PROVIDERS,
  AUTH0_DOMAIN,
  AUTH0_CLIENT_ID,
  AUTH0_CLIENT_SECRET,
  AUTH0_AUDIENCE,
  AUTH0_REDIRECT_URI,
  DEFAULT_SSO_ROLE_NAME,
} from '@backend/config/env.js';
import { logger } from '@backend/utils/logger.js';

let bcryptModulePromise: Promise<typeof import('bcrypt')> | null = null;

async function getBcrypt() {
  if (!bcryptModulePromise) {
    bcryptModulePromise = import('bcrypt');
  }
  return bcryptModulePromise;
}

const ALL_TENANT_PERMISSIONS = [
  'admin.roles.read',
  'admin.roles.write',
  'admin.policies.read',
  'admin.policies.write',
  'products.read',
  'products.write',
  'inventory.read',
  'inventory.write',
  'master.read',
  'master.write',
  'purchasing.read',
  'purchasing.write',
  'sales.write',
  'audit.read',
  'chat.use',
  'chat.approve',
] as const;

const registerBusinessSchema = z.object({
  businessName: z.string().min(2),
  businessSlug: z.string().min(2).optional(),
  adminName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  planCode: z.enum(['starter', 'growth', 'pro']).default('starter'),
});

const deprecatedRegisterSchema = z.object({
  tenantId: z.string().uuid().optional(),
  email: z.string().email(),
  username: z.string().min(3),
  password: z.string().min(8),
  roleId: z.string().uuid().optional(),
  businessName: z.string().min(2).optional(),
  businessSlug: z.string().min(2).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  email: z.string().email(),
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeUsername(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 40);
}

async function buildTenantAuthResponse(user: { id: string; tenantId: string; roleId: string; email: string }) {
  const roleRes = await query(
    `SELECT permissions FROM roles WHERE id = $1 AND tenant_id = $2`,
    [user.roleId, user.tenantId],
  );
  const permissions: string[] = roleRes.rowCount > 0 ? roleRes.rows[0].permissions ?? [] : [];
  const tenant = await getTenantControlState(user.tenantId);

  return {
    principalType: 'tenant_user' as const,
    id: user.id,
    tenantId: user.tenantId,
    tenantSlug: tenant.tenantSlug,
    tenantStatus: tenant.lifecycleStatus,
    roleId: user.roleId,
    email: user.email,
    permissions,
    features: tenant.features,
    limits: tenant.limits,
    usage: tenant.usage,
    restrictions: tenant.restrictions.restrictions,
    billing: buildTenantBillingSummary(tenant),
  };
}

export async function registerBusiness(req: Request, res: Response) {
  const parsed = registerBusinessSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });

  const { businessName, adminName, email, password, planCode } = parsed.data;
  const desiredSlug = slugify(parsed.data.businessSlug ?? businessName);
  const username = normalizeUsername(adminName || email.split('@')[0] || businessName);
  const plan = resolvePlanDefinition(planCode);
  const bcrypt = await getBcrypt();
  const passwordHash = await bcrypt.hash(password, 12);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tenantResult = await client.query(
      `INSERT INTO tenants (name, slug, lifecycle_status)
       VALUES ($1, $2, 'trialing')
       RETURNING id, slug`,
      [businessName, desiredSlug],
    );
    const tenantId = tenantResult.rows[0].id as string;

    const roleResult = await client.query(
      `INSERT INTO roles (tenant_id, name, permissions)
       VALUES ($1, 'admin', $2)
       RETURNING id`,
      [tenantId, [...ALL_TENANT_PERMISSIONS]],
    );
    const roleId = roleResult.rows[0].id as string;

    const userResult = await client.query(
      `INSERT INTO users (tenant_id, role_id, email, username, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, tenant_id, role_id, email`,
      [tenantId, roleId, email.toLowerCase(), username || 'admin', passwordHash],
    );

    await ensureTenantControlPlane(tenantId, { client, planCode: plan.code });
    await recordTenantAuditEvent({
      tenantId,
      actorType: 'system',
      eventType: 'tenant_registered',
      client,
      payload: {
        businessName,
        businessSlug: desiredSlug,
        adminEmail: email.toLowerCase(),
        planCode: plan.code,
      },
    });

    await client.query('COMMIT');

    const user = userResult.rows[0];
    const accessToken = signAccessToken({
      sub: user.id,
      principalType: 'tenant_user',
      tenantId: user.tenant_id,
      roleId: user.role_id,
    });
    const refreshToken = signRefreshToken({
      sub: user.id,
      principalType: 'tenant_user',
      tenantId: user.tenant_id,
      roleId: user.role_id,
    });

    res.status(201).json({
      accessToken,
      refreshToken,
      tenantId: user.tenant_id,
      tenantSlug: desiredSlug,
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    if (error?.code === '23505') {
      const detail = String(error?.detail ?? '').toLowerCase();
      if (detail.includes('(slug)')) {
        return res.status(409).json({ message: 'Business slug is already registered.' });
      }
      if (detail.includes('(tenant_id, email)')) {
        return res.status(409).json({ message: 'That email is already registered for this business.' });
      }
    }
    res.status(400).json({ message: error?.message ?? 'Failed to register business' });
  } finally {
    client.release();
  }
}

export async function register(req: Request, res: Response) {
  const parsed = deprecatedRegisterSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });

  return registerBusiness(
    {
      ...req,
      body: {
        businessName: parsed.data.businessName ?? parsed.data.username,
        businessSlug: parsed.data.businessSlug,
        adminName: parsed.data.username,
        email: parsed.data.email,
        password: parsed.data.password,
        planCode: 'starter',
      },
    } as Request,
    res,
  );
}

export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const { email, password } = parsed.data;
  try {
    const bcrypt = await getBcrypt();
    const result = await query(
      `SELECT u.id, u.tenant_id, u.role_id, u.email, u.password_hash, t.lifecycle_status
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE u.email = $1 AND u.status = 'active'`,
      [email.toLowerCase()],
    );
    if (result.rowCount === 0) return res.status(401).json({ message: 'Invalid credentials' });

    const user = result.rows[0];
    if (user.lifecycle_status === 'cancelled') {
      return res.status(403).json({ message: 'Tenant has been cancelled' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

    const accessToken = signAccessToken({
      sub: user.id,
      principalType: 'tenant_user',
      tenantId: user.tenant_id,
      roleId: user.role_id,
    });
    const refreshToken = signRefreshToken({
      sub: user.id,
      principalType: 'tenant_user',
      tenantId: user.tenant_id,
      roleId: user.role_id,
    });
    await query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);
    res.json({ accessToken, refreshToken });
  } catch (err) {
    logger.error({ err }, 'login failed');
    res.status(500).json({ message: 'Login failed' });
  }
}

export async function refresh(req: Request, res: Response) {
  const token = req.body?.refreshToken;
  if (!token) return res.status(400).json({ message: 'Missing refresh token' });
  try {
    const payload = verifyToken(token);
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);
    res.json({ accessToken, refreshToken });
  } catch {
    res.status(401).json({ message: 'Invalid or expired refresh token' });
  }
}

export async function forgotPassword(req: Request, res: Response) {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });

  res.json({ ok: true, message: 'If the account exists, reset instructions were sent.' });
}

export async function resetPassword(req: Request, res: Response) {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });

  const { email, newPassword } = parsed.data;
  const bcrypt = await getBcrypt();
  const passwordHash = await bcrypt.hash(newPassword, 12);

  await query(
    `UPDATE users SET password_hash = $1, updated_at = NOW()
     WHERE email = $2`,
    [passwordHash, email.toLowerCase()],
  );

  res.json({ ok: true });
}

export async function me(req: Request, res: Response) {
  if (!req.user || req.user.principalType !== 'tenant_user') {
    return res.status(401).json({ message: 'Unauthenticated' });
  }

  const response = await buildTenantAuthResponse({
    id: req.user.id,
    tenantId: req.user.tenantId,
    roleId: req.user.roleId,
    email: req.user.email,
  });

  res.json(response);
}

export async function ssoStart(req: Request, res: Response) {
  const provider = req.params.provider;
  if (!SSO_PROVIDERS.includes(provider)) return res.status(400).json({ message: 'Unsupported provider' });
  if (provider !== 'auth0') return res.status(400).json({ message: 'Only auth0 supported' });

  const tenantId = String(req.query.tenantId ?? '');
  if (!tenantId) return res.status(400).json({ message: 'tenantId required' });
  if (!AUTH0_DOMAIN || !AUTH0_CLIENT_ID || !AUTH0_CLIENT_SECRET || !AUTH0_REDIRECT_URI) {
    return res.status(500).json({ message: 'Auth0 not configured' });
  }

  const state = Buffer.from(JSON.stringify({ tenantId, nonce: crypto.randomUUID() })).toString('base64url');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: AUTH0_CLIENT_ID,
    redirect_uri: AUTH0_REDIRECT_URI,
    scope: 'openid profile email',
    state,
    audience: AUTH0_AUDIENCE || undefined as any,
  });
  const url = `https://${AUTH0_DOMAIN}/authorize?${params.toString()}`;
  res.redirect(url);
}

export async function ssoCallback(req: Request, res: Response) {
  const provider = req.params.provider;
  if (provider !== 'auth0') return res.status(400).json({ message: 'Only auth0 supported' });

  const code = String(req.query.code ?? '');
  const state = String(req.query.state ?? '');
  if (!code || !state) return res.status(400).json({ message: 'Missing code/state' });

  const stateObj = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
  const tenantId = stateObj.tenantId as string;
  if (!tenantId) return res.status(400).json({ message: 'Invalid state' });

  const tokenRes = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: AUTH0_CLIENT_ID,
      client_secret: AUTH0_CLIENT_SECRET,
      code,
      redirect_uri: AUTH0_REDIRECT_URI,
    }),
  });
  if (!tokenRes.ok) return res.status(401).json({ message: 'Token exchange failed' });
  const tokenJson: any = await tokenRes.json();

  const userInfoRes = await fetch(`https://${AUTH0_DOMAIN}/userinfo`, {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!userInfoRes.ok) return res.status(401).json({ message: 'Userinfo failed' });
  const profile: any = await userInfoRes.json();

  const auth0Id = profile.sub as string;
  const email = String(profile.email ?? '').toLowerCase();
  const name = String(profile.name ?? email);
  if (!auth0Id || !email) return res.status(400).json({ message: 'Auth0 profile missing' });

  let userRes = await query(
    `SELECT u.id, u.tenant_id, u.role_id, u.email
     FROM sso_identities s
     JOIN users u ON s.user_id = u.id
     WHERE s.tenant_id = $1 AND s.provider = 'auth0' AND s.provider_user_id = $2`,
    [tenantId, auth0Id],
  );

  if (userRes.rowCount === 0) {
    userRes = await query(
      `SELECT id, tenant_id, role_id, email FROM users WHERE tenant_id = $1 AND email = $2`,
      [tenantId, email],
    );
  }

  let userId: string;
  let roleId: string;
  if (userRes.rowCount === 0) {
    const roleRes = await query(
      `SELECT id FROM roles WHERE tenant_id = $1 AND name = $2`,
      [tenantId, DEFAULT_SSO_ROLE_NAME],
    );
    roleId = roleRes.rowCount
      ? roleRes.rows[0].id
      : (await query(`SELECT id FROM roles WHERE tenant_id = $1 LIMIT 1`, [tenantId])).rows[0]?.id;
    if (!roleId) return res.status(400).json({ message: 'No role available for SSO user' });

    const createRes = await query(
      `INSERT INTO users (tenant_id, role_id, email, username, password_hash)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, role_id`,
      [tenantId, roleId, email, normalizeUsername(name) || 'sso', 'sso'],
    );
    userId = createRes.rows[0].id;
    roleId = createRes.rows[0].role_id;
  } else {
    userId = userRes.rows[0].id;
    roleId = userRes.rows[0].role_id;
  }

  await query(
    `INSERT INTO sso_identities (tenant_id, user_id, provider, provider_user_id)
     VALUES ($1,$2,'auth0',$3)
     ON CONFLICT DO NOTHING`,
    [tenantId, userId, auth0Id],
  );

  const accessToken = signAccessToken({ sub: userId, principalType: 'tenant_user', tenantId, roleId });
  const refreshToken = signRefreshToken({ sub: userId, principalType: 'tenant_user', tenantId, roleId });
  res.json({ accessToken, refreshToken });
}
