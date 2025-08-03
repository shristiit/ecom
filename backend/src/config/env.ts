import dotenv from 'dotenv';
import process from 'node:process';

dotenv.config();

/** Read an env-var or throw.  Falls back to the default you pass in. */
function required(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback;
  if (v === undefined) {
    throw new Error(`Environment variable ${key} is missing`);
  }
  return v;
}

export const MONGO_URL: string         = required('MONGO_URL',  'mongodb+srv://ecom:ecom@ecom1.eqe2d1h.mongodb.net/ecom?retryWrites=true&w=majority&appName=ecom1');
export const JWT_SECRET: string        = required('JWT_SECRET', 'supersecret');
export const ACCESS_TOKEN_TTL: string  = required('ACCESS_TOKEN_TTL',  '15m');
export const REFRESH_TOKEN_TTL: string = required('REFRESH_TOKEN_TTL', '7d');
export const PORT: number              = parseInt(required('PORT', '4000'), 10);
