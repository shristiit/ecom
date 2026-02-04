import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { signAccessToken, signRefreshToken } from '../../utils/jwt.js';
import { SSO_PROVIDERS } from '../../config/env.js';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../../config/env.js';

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

export async function me(_req: Request, res: Response) {
  res.json(_req.user);
}

export async function ssoStart(req: Request, res: Response) {
  const provider = req.params.provider;
  if (!SSO_PROVIDERS.includes(provider)) return res.status(400).json({ message: 'Unsupported provider' });
  // TODO: redirect to provider auth URL
  res.status(501).json({ message: 'SSO start not implemented yet' });
}

export async function ssoCallback(_req: Request, res: Response) {
  // TODO: exchange code, upsert user, issue tokens
  res.status(501).json({ message: 'SSO callback not implemented yet' });
}
