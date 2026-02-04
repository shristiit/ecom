import { Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { query } from '../../db/pool.js';
import { signAccessToken, signRefreshToken } from '../../utils/jwt.js';
import { jwtVerify, createRemoteJWKSet } from 'jose';

const registerSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  tenantId: z.string().uuid(),
  email: z.string().email(),
  password: z.string().min(1),
});

const auth0Schema = z.object({
  tenantId: z.string().uuid(),
  idToken: z.string().min(10),
  audience: z.string().min(3),
  issuer: z.string().min(10),
});

export async function register(req: Request, res: Response) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const { tenantId, name, email, password } = parsed.data;

  const hash = await bcrypt.hash(password, 12);
  const result = await query(
    `INSERT INTO customers (tenant_id, name, email, password_hash, auth_provider, status, role)
     VALUES ($1,$2,$3,$4,'local','active','customer') RETURNING id, tenant_id, email, role`,
    [tenantId, name, email.toLowerCase(), hash]
  );

  const c = result.rows[0];
  const accessToken = signAccessToken({ sub: c.id, tenantId: c.tenant_id, role: c.role, type: 'customer' });
  const refreshToken = signRefreshToken({ sub: c.id, tenantId: c.tenant_id, role: c.role, type: 'customer' });
  res.status(201).json({ accessToken, refreshToken });
}

export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const { tenantId, email, password } = parsed.data;

  const result = await query(
    `SELECT id, tenant_id, email, role, password_hash FROM customers WHERE tenant_id = $1 AND email = $2 AND status = 'active'`,
    [tenantId, email.toLowerCase()]
  );
  if (result.rowCount === 0) return res.status(401).json({ message: 'Invalid credentials' });
  const c = result.rows[0];
  if (!c.password_hash) return res.status(401).json({ message: 'Use SSO to login' });

  const ok = await bcrypt.compare(password, c.password_hash);
  if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

  const accessToken = signAccessToken({ sub: c.id, tenantId: c.tenant_id, role: c.role, type: 'customer' });
  const refreshToken = signRefreshToken({ sub: c.id, tenantId: c.tenant_id, role: c.role, type: 'customer' });
  res.json({ accessToken, refreshToken });
}

export async function auth0Exchange(req: Request, res: Response) {
  const parsed = auth0Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const { tenantId, idToken, audience, issuer } = parsed.data;

  try {
    const normalizedIssuer = issuer.endsWith('/') ? issuer : `${issuer}/`;
    const jwks = createRemoteJWKSet(new URL(`${normalizedIssuer}.well-known/jwks.json`));
    const { payload } = await jwtVerify(idToken, jwks, { audience, issuer: normalizedIssuer });

    const auth0Id = payload.sub as string;
    const email = String(payload.email ?? '').toLowerCase();
    const name = String(payload.name ?? email);

    if (!email) return res.status(400).json({ message: 'Auth0 token missing email' });

    let result = await query(
      `SELECT id, tenant_id, email, role FROM customers WHERE tenant_id = $1 AND auth_provider = 'auth0' AND auth_user_id = $2`,
      [tenantId, auth0Id]
    );

    if (result.rowCount === 0) {
      result = await query(
        `INSERT INTO customers (tenant_id, name, email, auth_provider, auth_user_id, status, role)
         VALUES ($1,$2,$3,'auth0',$4,'active','customer') RETURNING id, tenant_id, email, role`,
        [tenantId, name, email, auth0Id]
      );
    }

    const c = result.rows[0];
    const accessToken = signAccessToken({ sub: c.id, tenantId: c.tenant_id, role: c.role, type: 'customer' });
    const refreshToken = signRefreshToken({ sub: c.id, tenantId: c.tenant_id, role: c.role, type: 'customer' });
    res.json({ accessToken, refreshToken });
  } catch {
    res.status(401).json({ message: 'Invalid Auth0 token' });
  }
}
