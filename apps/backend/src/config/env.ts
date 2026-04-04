import dotenv from 'dotenv';
import process from 'node:process';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

function required(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback;
  if (v === undefined) throw new Error(`Missing env ${key}`);
  return v;
}

export const NODE_ENV = required('NODE_ENV', 'development');
export const PORT = parseInt(required('PORT', '4000'), 10);
export const DATABASE_URL = required('DATABASE_URL');
export const JWT_SECRET = required('JWT_SECRET');
export const ACCESS_TOKEN_TTL = required('ACCESS_TOKEN_TTL', '15m');
export const REFRESH_TOKEN_TTL = required('REFRESH_TOKEN_TTL', '7d');
export const CORS_ORIGIN = required('CORS_ORIGIN', 'http://localhost:3000');
export const CORS_ORIGINS = CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
export const CONVERSATIONAL_ENGINE_URL = required('CONVERSATIONAL_ENGINE_URL', 'http://localhost:8000');
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
export const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
export const RESERVATION_TTL_MIN = parseInt(required('RESERVATION_TTL_MIN', '30'), 10);

export const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN ?? '';
export const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID ?? '';
export const AUTH0_CLIENT_SECRET = process.env.AUTH0_CLIENT_SECRET ?? '';
export const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE ?? '';
export const AUTH0_REDIRECT_URI = process.env.AUTH0_REDIRECT_URI ?? '';
export const DEFAULT_SSO_ROLE_NAME = process.env.DEFAULT_SSO_ROLE_NAME ?? 'staff';

export const SSO_PROVIDERS = (process.env.SSO_PROVIDERS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const S3_REGION = process.env.S3_REGION ?? '';
export const S3_BUCKET = process.env.S3_BUCKET ?? '';
export const S3_PUBLIC_BASE_URL = process.env.S3_PUBLIC_BASE_URL ?? '';
