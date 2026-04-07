import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { query } from '@backend/db/pool.js';
import { signAccessToken, signRefreshToken } from '@backend/utils/jwt.js';
import { SSO_PROVIDERS, AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_AUDIENCE, AUTH0_REDIRECT_URI, DEFAULT_SSO_ROLE_NAME } from '@backend/config/env.js';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@backend/config/env.js';
import fetch from 'node-fetch';
import crypto from 'node:crypto';

const registerSchema = z.object({
  tenantId: z.string().uuid(),
  email: z.string().email(),
  username: z.string().min(3),
  password: z.string().min(8),
  roleId: z.string().uuid(),
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

export async function register(req: Request, res: Response) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const { tenantId, email, username, password, roleId } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 12);

  const result = await query(
    `INSERT INTO users (tenant_id, email, username, password_hash, role_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, tenant_id, role_id, email`,
    [tenantId, email.toLowerCase(), username.toLowerCase(), passwordHash, roleId]
  );

  const user = result.rows[0];
  const accessToken = signAccessToken({ sub: user.id, tenantId: user.tenant_id, roleId: user.role_id });
  const refreshToken = signRefreshToken({ sub: user.id, tenantId: user.tenant_id, roleId: user.role_id });
  res.status(201).json({ accessToken, refreshToken });
}

export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const { email, password } = parsed.data;

  const result = await query(
    `SELECT id, tenant_id, role_id, email, password_hash FROM users WHERE email = $1 AND status = 'active'`,
    [email.toLowerCase()]
  );
  if (result.rowCount === 0) return res.status(401).json({ message: 'Invalid credentials' });

  const user = result.rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

  const accessToken = signAccessToken({ sub: user.id, tenantId: user.tenant_id, roleId: user.role_id });
  const refreshToken = signRefreshToken({ sub: user.id, tenantId: user.tenant_id, roleId: user.role_id });
  res.json({ accessToken, refreshToken });
}

export async function refresh(req: Request, res: Response) {
  const token = req.body?.refreshToken;
  if (!token) return res.status(400).json({ message: 'Missing refresh token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    const accessToken = signAccessToken({ sub: payload.sub, tenantId: payload.tenantId, roleId: payload.roleId });
    const refreshToken = signRefreshToken({ sub: payload.sub, tenantId: payload.tenantId, roleId: payload.roleId });
    res.json({ accessToken, refreshToken });
  } catch {
    res.status(401).json({ message: 'Invalid or expired refresh token' });
  }
}

export async function forgotPassword(req: Request, res: Response) {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });

  // Intentionally return success regardless of account existence to avoid user enumeration.
  res.json({ ok: true, message: 'If the account exists, reset instructions were sent.' });
}

export async function resetPassword(req: Request, res: Response) {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });

  const { email, newPassword } = parsed.data;
  const passwordHash = await bcrypt.hash(newPassword, 12);

  await query(
    `UPDATE users SET password_hash = $1, updated_at = NOW()
     WHERE email = $2`,
    [passwordHash, email.toLowerCase()]
  );

  res.json({ ok: true });
}

export async function me(_req: Request, res: Response) {
  const roleRes = await query(
    `SELECT permissions FROM roles WHERE id = $1 AND tenant_id = $2`,
    [_req.user!.roleId, _req.user!.tenantId]
  );

  res.json({
    ..._req.user,
    permissions: roleRes.rowCount > 0 ? roleRes.rows[0].permissions ?? [] : [],
  });
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

export async function ssoCallback(_req: Request, res: Response) {
  const provider = _req.params.provider;
  if (provider !== 'auth0') return res.status(400).json({ message: 'Only auth0 supported' });

  const code = String(_req.query.code ?? '');
  const state = String(_req.query.state ?? '');
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

  // link or create user
  let userRes = await query(
    `SELECT u.id, u.tenant_id, u.role_id, u.email
     FROM sso_identities s
     JOIN users u ON s.user_id = u.id
     WHERE s.tenant_id = $1 AND s.provider = 'auth0' AND s.provider_user_id = $2`,
    [tenantId, auth0Id]
  );

  if (userRes.rowCount === 0) {
    // try existing user by email
    userRes = await query(
      `SELECT id, tenant_id, role_id, email FROM users WHERE tenant_id = $1 AND email = $2`,
      [tenantId, email]
    );
  }

  let userId: string;
  let roleId: string;
  if (userRes.rowCount === 0) {
    const roleRes = await query(
      `SELECT id FROM roles WHERE tenant_id = $1 AND name = $2`,
      [tenantId, DEFAULT_SSO_ROLE_NAME]
    );
    roleId = roleRes.rowCount ? roleRes.rows[0].id : (await query(`SELECT id FROM roles WHERE tenant_id = $1 LIMIT 1`, [tenantId])).rows[0]?.id;
    if (!roleId) return res.status(400).json({ message: 'No role available for SSO user' });

    const createRes = await query(
      `INSERT INTO users (tenant_id, role_id, email, username, password_hash)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, role_id`,
      [tenantId, roleId, email, name.toLowerCase().replace(/\\s+/g, ''), 'sso']
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
    [tenantId, userId, auth0Id]
  );

  const accessToken = signAccessToken({ sub: userId, tenantId, roleId });
  const refreshToken = signRefreshToken({ sub: userId, tenantId, roleId });
  res.json({ accessToken, refreshToken });
}
