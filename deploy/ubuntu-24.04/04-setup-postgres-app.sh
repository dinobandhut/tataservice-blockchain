#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# TataService Blockchain — PostgreSQL 16, Backend API, Systemd & Nginx Setup
# =============================================================================

if [[ "${EUID}" -ne 0 ]]; then
  echo "ERROR: Please run as root (sudo bash $0)" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
APP_DIR="/opt/tataservice"
ENV_FILE="${APP_DIR}/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: ${ENV_FILE} not found. Run 03-setup-node.sh first." >&2
  exit 1
fi

# shellcheck disable=SC1090
source "${ENV_FILE}"

# 1. Install PostgreSQL 16 & Nginx if not present
apt-get update
apt-get install -y postgresql postgresql-contrib nginx

# 2. Configure PostgreSQL user & database cleanly
su - postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='${POSTGRES_USER}'\" | grep -q 1 || psql -c \"CREATE USER ${POSTGRES_USER} WITH PASSWORD '${POSTGRES_PASSWORD}';\""
su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='${POSTGRES_DB}'\" | grep -q 1 || psql -c \"CREATE DATABASE ${POSTGRES_DB} OWNER ${POSTGRES_USER};\""

# 3. Copy backend & apply schema migrations
rm -rf "${APP_DIR}/backend"
cp -r "${REPO_DIR}/backend" "${APP_DIR}/backend"
cd "${APP_DIR}/backend"
npm install --omit=dev && npm install tsx --no-save
DATABASE_URL="${DATABASE_URL}" npm run migrate

# 4. Build frontend if package.json exists at repo root
if [[ -f "${REPO_DIR}/package.json" ]]; then
  cd "${REPO_DIR}"
  npm install && npm run build
  rm -rf "${APP_DIR}/dist"
  cp -r "${REPO_DIR}/dist" "${APP_DIR}/dist"
fi

chown -R tataservice:tataservice "${APP_DIR}"

# 5. Install systemd unit files
cp "${SCRIPT_DIR}/systemd/"*.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable geth-tata lighthouse-bn-tata lighthouse-vc-tata tata-explorer-api

# 6. Install Nginx reverse proxy config
cp "${SCRIPT_DIR}/nginx/tata-rpc-explorer.conf" /etc/nginx/sites-available/tataservice
ln -sf /etc/nginx/sites-available/tataservice /etc/nginx/sites-enabled/tataservice
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "[04-setup-postgres-app] PostgreSQL, Explorer API, systemd units, and Nginx configured."
echo "Start services with: sudo systemctl start geth-tata lighthouse-bn-tata lighthouse-vc-tata tata-explorer-api"
