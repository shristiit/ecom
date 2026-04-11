import pg from 'pg';
import type { QueryResultRow } from 'pg';
import { DATABASE_URL } from '@backend/config/env.js';
import { buildPgClientConfig } from '@backend/db/connection.js';

const { Pool } = pg;

export const pool = new Pool(buildPgClientConfig(DATABASE_URL));

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params?: any[]) {
  const res = await pool.query<T>(text, params);
  return res;
}
