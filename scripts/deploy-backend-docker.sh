#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/ecom/backend}"
BRANCH="${BRANCH:-master}"
APP_ENV="${APP_ENV:-dev}"
CONTAINER_NAME="${CONTAINER_NAME:-stockaisle-backend}"
HOST_PORT="${HOST_PORT:-4000}"

if docker compose version >/dev/null 2>&1; then
  DOCKER_COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DOCKER_COMPOSE_CMD="docker-compose"
else
  echo "Neither 'docker compose' nor 'docker-compose' is available."
  exit 1
fi

echo "[backend-docker] Deploying ${APP_ENV} from branch ${BRANCH} in ${APP_DIR}"
cd "$APP_DIR"

git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

${DOCKER_COMPOSE_CMD} down --remove-orphans
APP_ENV="$APP_ENV" HOST_PORT="$HOST_PORT" ${DOCKER_COMPOSE_CMD} build --pull
docker run --rm --env-file .env "stockaisle-backend:${APP_ENV}" npm run migrate:up
APP_ENV="$APP_ENV" HOST_PORT="$HOST_PORT" ${DOCKER_COMPOSE_CMD} up -d

docker ps --filter "name=${CONTAINER_NAME}"
echo "[backend-docker] Deploy complete"
