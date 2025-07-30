import jwt, { Secret } from 'jsonwebtoken';
import {
  JWT_SECRET,
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL,
} from '../config/env.js';
import { IUser } from '../models/user.model.js';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

const secret: Secret = JWT_SECRET;          

export const signTokens = (user: IUser): Tokens => {
  const payload = { sub: user._id.toString(), role: user.role };

  const accessToken = jwt.sign(payload, secret, {
    expiresIn: ACCESS_TOKEN_TTL,            
  });

  const refreshToken = jwt.sign(payload, secret, {
    expiresIn: REFRESH_TOKEN_TTL,
  });

  return { accessToken, refreshToken };
};

export const verifyToken = <T>(token: string): T =>
  jwt.verify(token, secret) as T;
