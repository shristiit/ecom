#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/ecom/backend}"
BRANCH="${BRANCH:-master}"
APP_ENV="${APP_ENV:-dev}"
CONTAINER_NAME="${CONTAINER_NAME:-stockaisle-backend}"
HOST_PORT="${HOST_PORT:-4000}"

echo "[backend-docker] Deploying ${APP_ENV} from branch ${BRANCH} in ${APP_DIR}"
cd "$APP_DIR"

git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

docker compose down --remove-orphans
APP_ENV="$APP_ENV" HOST_PORT="$HOST_PORT" docker compose build --pull
docker run --rm --env-file .env "stockaisle-backend:${APP_ENV}" npm run migrate:up
APP_ENV="$APP_ENV" HOST_PORT="$HOST_PORT" docker compose up -d

docker ps --filter "name=${CONTAINER_NAME}"
echo "[backend-docker] Deploy complete"
