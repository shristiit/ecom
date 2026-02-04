import jwt from 'jsonwebtoken';
import { JWT_SECRET, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL } from '../config/env.js';

export function signAccessToken(payload: Record<string, any>) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

export function signRefreshToken(payload: Record<string, any>) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: REFRESH_TOKEN_TTL });
}
