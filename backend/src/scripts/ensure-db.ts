import { Client, type ClientConfig } from 'pg';
import { buildPgClientConfig } from '@backend/db/connection.js';

function buildClientConfig(connectionString: string): ClientConfig {
  return buildPgClientConfig(connectionString);
}

function getDatabaseUrl(): URL {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error('Missing DATABASE_URL');
  }

  return new URL(raw);
}

function getDatabaseName(url: URL): string {
  const databaseName = url.pathname.replace(/^\/+/, '');
  if (!databaseName) {
    throw new Error('DATABASE_URL must include a database name');
  }

  return databaseName;
}

function buildAdminConnectionString(url: URL): string {
  const adminUrl = new URL(url.toString());
  adminUrl.pathname = '/postgres';
  return adminUrl.toString();
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function main() {
  const databaseUrl = getDatabaseUrl();
  const databaseName = getDatabaseName(databaseUrl);

  if (databaseName === 'postgres') {
    console.log('DATABASE_URL already points at postgres; skipping database creation');
    return;
  }

  const adminClient = new Client(buildClientConfig(buildAdminConnectionString(databaseUrl)));

  try {
    await adminClient.connect();
    const exists = await adminClient.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [databaseName]
    );

    if (exists.rowCount && exists.rowCount > 0) {
      console.log(`Database ${databaseName} already exists`);
      return;
    }

    console.log(`Creating database ${databaseName}`);
    await adminClient.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    console.log(`Created database ${databaseName}`);
  } finally {
    await adminClient.end();
  }
}

main().catch((error) => {
  console.error('Database bootstrap failed:', error);
  process.exit(1);
});
