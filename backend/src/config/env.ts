import dotenv from 'dotenv';
import process from 'node:process';

dotenv.config();

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
export const CONVERSATIONAL_ENGINE_URL = required('CONVERSATIONAL_ENGINE_URL', 'http://localhost:8000');

export const SSO_PROVIDERS = (process.env.SSO_PROVIDERS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const SSO_GOOGLE = {
  clientId: process.env.SSO_GOOGLE_CLIENT_ID ?? '',
  clientSecret: process.env.SSO_GOOGLE_CLIENT_SECRET ?? '',
  redirectUri: process.env.SSO_GOOGLE_REDIRECT_URI ?? '',
};

export const SSO_AZUREAD = {
  clientId: process.env.SSO_AZUREAD_CLIENT_ID ?? '',
  clientSecret: process.env.SSO_AZUREAD_CLIENT_SECRET ?? '',
  tenantId: process.env.SSO_AZUREAD_TENANT_ID ?? '',
  redirectUri: process.env.SSO_AZUREAD_REDIRECT_URI ?? '',
};
