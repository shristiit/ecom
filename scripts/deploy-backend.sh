#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/ecom/backend}"
BRANCH="${BRANCH:-master}"
SERVICE_NAME="${SERVICE_NAME:-stockaisle-backend}"

echo "[backend] Deploying branch ${BRANCH} in ${APP_DIR}"
cd "$APP_DIR"

git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

npm ci
npm run build:prod
npm run migrate:up

if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files | grep -q "^${SERVICE_NAME}\\.service"; then
  sudo systemctl restart "${SERVICE_NAME}"
  sudo systemctl --no-pager --full status "${SERVICE_NAME}" | sed -n '1,20p'
elif command -v pm2 >/dev/null 2>&1; then
  if pm2 describe "${SERVICE_NAME}" >/dev/null 2>&1; then
    pm2 restart "${SERVICE_NAME}"
  else
    pm2 start dist/server.js --name "${SERVICE_NAME}"
  fi
  pm2 save
  pm2 list
else
  echo "No systemd service '${SERVICE_NAME}' or pm2 found."
  echo "Run manually: npm run start:prod"
  exit 1
fi

echo "[backend] Deploy complete"
