import type { ClientConfig } from 'pg';
import { NODE_ENV } from '@backend/config/env.js';

const SSL_QUERY_PARAMS = [
  'sslmode',
  'sslcert',
  'sslkey',
  'sslrootcert',
  'ssl',
] as const;

function shouldUseSsl(connectionString: string): boolean {
  const url = new URL(connectionString);
  const sslMode = url.searchParams.get('sslmode');

  return (
    NODE_ENV === 'production' ||
    process.env.DATABASE_SSL === 'true' ||
    process.env.PGSSLMODE === 'require' ||
    (sslMode !== null && sslMode !== 'disable')
  );
}

export function normalizeDatabaseConnectionString(connectionString: string): string {
  const url = new URL(connectionString);

  for (const param of SSL_QUERY_PARAMS) {
    url.searchParams.delete(param);
  }

  return url.toString();
}

export function buildPgClientConfig(connectionString: string): ClientConfig {
  const normalizedConnectionString = normalizeDatabaseConnectionString(connectionString);

  if (!shouldUseSsl(connectionString)) {
    return { connectionString: normalizedConnectionString };
  }

  return {
    connectionString: normalizedConnectionString,
    ssl: { rejectUnauthorized: false },
  };
}
