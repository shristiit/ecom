#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/ecom/admin}"
BRANCH="${BRANCH:-master}"
WEB_ROOT="${WEB_ROOT:-/var/www/stockaisle-admin}"
API_BASE_URL="${EXPO_PUBLIC_API_URL:-/api}"

echo "[admin] Deploying branch ${BRANCH} in ${APP_DIR}"
cd "$APP_DIR"

git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

npm ci
EXPO_PUBLIC_API_URL="${API_BASE_URL}" npm run build:prod

sudo mkdir -p "${WEB_ROOT}"
if command -v rsync >/dev/null 2>&1; then
  sudo rsync -av --delete dist/ "${WEB_ROOT}/"
else
  sudo cp -a dist/. "${WEB_ROOT}/"
fi
sudo chown -R www-data:www-data "${WEB_ROOT}"

sudo nginx -t
sudo systemctl reload nginx

echo "[admin] Deploy complete"
