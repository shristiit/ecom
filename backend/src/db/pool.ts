import pg from 'pg';
import type { QueryResultRow } from 'pg';
import { DATABASE_URL, NODE_ENV } from '../config/env.js';

const { Pool } = pg;
const requiresSslFromUrl = /\bsslmode=require\b/i.test(DATABASE_URL);
const useSsl =
  NODE_ENV === 'production' ||
  requiresSslFromUrl ||
  process.env.DATABASE_SSL === 'true' ||
  process.env.PGSSLMODE === 'require';

export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
});

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params?: any[]) {
  const res = await pool.query<T>(text, params);
  return res;
}
