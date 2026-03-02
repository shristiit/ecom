import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { JWT_SECRET, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL } from '../config/env.js';

const accessTokenTtl = ACCESS_TOKEN_TTL as SignOptions['expiresIn'];
const refreshTokenTtl = REFRESH_TOKEN_TTL as SignOptions['expiresIn'];

export function signAccessToken(payload: Record<string, any>) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: accessTokenTtl });
}

export function signRefreshToken(payload: Record<string, any>) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: refreshTokenTtl });
}
