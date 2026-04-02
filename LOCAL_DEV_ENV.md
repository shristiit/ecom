# Local Env Setup (Clean Version)

This repo now uses one primary env file per app.
Set these once, then switch runtime targets with scripts instead of editing env values every run.

## Unified Dev Commands

- `pnpm run dev`: starts backend + admin against `https://api-dev.stockaisle.com/api`.
- `pnpm run dev:local`: starts backend + admin against your local API (`http://localhost:4000/api`) and requires the SSH tunnel below.

Run the SSH tunnel *before* `pnpm run dev:local`:

```bash
ssh -i <path-to-pem> \
  -L 5433:ecom-db.c6tik80wsqeb.us-east-1.rds.amazonaws.com:5432 \
  <ec2-user>@<ec2-public-host-or-ip>
```

## Active Env Files

- `admin/.env`: Admin app mode + API URL mapping.
- `backend/.env`: Backend runtime config (API, DB, auth, integrations).
- `ecommerce/.env`: Ecommerce app mode + API URL mapping.
- `admin/ios/.xcode.env` and `admin/ios/.xcode.env.local`: Xcode/node path only (iOS native build internals).

Removed as redundant:

- `admin/.env.example`
- `backend/.env.sample`
- `backend/.env.local`

## Admin Variables (`admin/.env`)

- `ADMIN_DEFAULT_MODE`: default mode for `pnpm --filter admin start` (`dev`, `browserstack`, `prod`).
- `ADMIN_DEV_API_URL`: used when mode is `dev`.
- `ADMIN_BROWSERSTACK_API_URL`: used when mode is `browserstack`.
- `ADMIN_PROD_API_URL`: used when mode is `prod`.
- `EXPO_PUBLIC_API_URL`: fallback for direct Expo tooling.
- `EXPO_PUBLIC_ENABLE_MFA`: client-side MFA toggle.
- `EXPO_PUBLIC_SSO_URL`: client-side SSO URL.

Switch mode without editing env values:

```bash
pnpm --filter admin start:dev
pnpm --filter admin start:browserstack
pnpm --filter admin start:prod
```

Native:

```bash
pnpm --filter admin android:dev
pnpm --filter admin android:browserstack
pnpm --filter admin android:prod
pnpm --filter admin ios:dev
pnpm --filter admin ios:browserstack
pnpm --filter admin ios:prod
```

## Ecommerce Variables (`ecommerce/.env`)

- `ECOMMERCE_DEFAULT_MODE`: default mode for `pnpm --filter ecommerce start` (`local`, `dev`, `prod`).
- `ECOMMERCE_LOCAL_API_URL`: used when mode is `local`.
- `ECOMMERCE_DEV_API_URL`: used when mode is `dev`.
- `ECOMMERCE_PROD_API_URL`: used when mode is `prod`.
- `EXPO_PUBLIC_API_URL`: fallback for direct Expo tooling.
- `EXPO_PUBLIC_TENANT_ID`: required for storefront auth/catalog requests.

Switch mode without editing env values:

```bash
pnpm --filter ecommerce start:local
pnpm --filter ecommerce start:dev
pnpm --filter ecommerce start:prod
```

## Backend Variables (`backend/.env`)

Used by:

- `backend/src/config/env.ts` (application runtime)
- `backend/docker-compose.yml` (container runtime)

Important keys:

- `DATABASE_URL`: Postgres connection string. Must be `postgres://...` or `postgresql://...`, not `http://...`.
- `PORT`: backend port (default `4000`).
- `CORS_ORIGIN`: comma-separated allowed origins.
- `JWT_SECRET`: JWT signing secret.
- `OPENAI_API_KEY`: OpenAI key.
- `SSO_*` and `AUTH0_*`: optional SSO/Auth0 config.

Example for local SSH tunnel on port `5433`:

```bash
DATABASE_URL=postgres://<db_user>:<db_password>@localhost:5433/<db_name>?uselibpqcompat=true&sslmode=require
```

## DB Tunnel (If using remote RDS from local backend)

Run in a separate terminal and keep it running:

```bash
ssh -i <path-to-pem> \
  -L 5433:ecom-db.c6tik80wsqeb.us-east-1.rds.amazonaws.com:5432 \
  <ec2-user>@<ec2-public-host-or-ip>
```

Then use `localhost:5433` in `backend/.env` `DATABASE_URL`.
