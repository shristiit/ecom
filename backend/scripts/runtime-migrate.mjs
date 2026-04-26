import { spawnSync } from 'node:child_process';

const direction = process.argv[2];

if (direction !== 'up' && direction !== 'down') {
  console.error('Usage: node ./scripts/runtime-migrate.mjs <up|down>');
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('Missing DATABASE_URL');
  process.exit(1);
}

const url = new URL(databaseUrl);
url.searchParams.set('uselibpqcompat', 'true');
process.env.DATABASE_URL = url.toString();

const result = spawnSync(
  'node-pg-migrate',
  [direction, '--tsx', '--tsconfig', 'tsconfig.json', '--check-order', 'false'],
  {
    env: process.env,
    stdio: 'inherit',
  }
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
