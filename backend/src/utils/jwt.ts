import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { JWT_SECRET, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL } from '@backend/config/env.js';

const accessTokenTtl = ACCESS_TOKEN_TTL as SignOptions['expiresIn'];
const refreshTokenTtl = REFRESH_TOKEN_TTL as SignOptions['expiresIn'];

export type TenantUserTokenPayload = {
  sub: string;
  principalType: 'tenant_user';
  tenantId: string;
  roleId: string;
};

export type PlatformAdminTokenPayload = {
  sub: string;
  principalType: 'platform_admin';
};

export type AppTokenPayload = {
  sub: string;
  principalType?: 'tenant_user' | 'platform_admin' | string;
  tenantId?: string;
  roleId?: string;
  [key: string]: unknown;
};

export function signAccessToken(payload: AppTokenPayload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: accessTokenTtl });
}

export function signRefreshToken(payload: AppTokenPayload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: refreshTokenTtl });
}

export function verifyToken(token: string) {
  return jwt.verify(token, JWT_SECRET) as AppTokenPayload;
}
