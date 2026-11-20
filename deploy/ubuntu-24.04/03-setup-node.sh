#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# TataService Blockchain — Initialize Node Directories, JWT, Secrets & Genesis
# =============================================================================

if [[ "${EUID}" -ne 0 ]]; then
  echo "ERROR: Please run as root (sudo bash $0)" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
APP_DIR="/opt/tataservice"
DATA_DIR="/var/lib/tataservice"

mkdir -p "${APP_DIR}" "${DATA_DIR}/geth" "${DATA_DIR}/lighthouse-bn" "${DATA_DIR}/lighthouse-vc" "${DATA_DIR}/jwt"
cp -r "${REPO_DIR}/network" "${APP_DIR}/"

# Generate secure Engine API JWT secret (0600)
JWT_FILE="${DATA_DIR}/jwt/jwtsecret"
if [[ ! -f "${JWT_FILE}" ]]; then
  umask 077
  openssl rand -hex 32 | tr -d '\n' > "${JWT_FILE}"
fi
chmod 600 "${JWT_FILE}"

# Generate .env from template with fresh cryptographic secrets if missing
ENV_FILE="${APP_DIR}/.env"
if [[ ! -f "${ENV_FILE}" ]]; then
  cp "${REPO_DIR}/network/.env.node.example" "${ENV_FILE}"
  DB_PASS="$(openssl rand -hex 24)"
  JWT_SECRET="$(openssl rand -hex 32)"
  GRAF_PASS="$(openssl rand -hex 16)"

  sed -i "s|CHANGE_ME_STRONG_DB_PASSWORD|${DB_PASS}|g" "${ENV_FILE}"
  sed -i "s|CHANGE_ME_64_CHAR_RANDOM_HEX_SECRET|${JWT_SECRET}|g" "${ENV_FILE}"
  sed -i "s|CHANGE_ME_GRAFANA_PASSWORD|${GRAF_PASS}|g" "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
  echo "Created ${ENV_FILE} with generated database & JWT secrets."
fi

# Initialize Go-Ethereum data directory from canonical Chain ID 810161 genesis.json
if [[ ! -d "${DATA_DIR}/geth/geth/chaindata" ]]; then
  /usr/local/bin/geth init --datadir="${DATA_DIR}/geth" "${APP_DIR}/network/execution/genesis.json"
fi

if [[ ! -f "${APP_DIR}/network/consensus/genesis.ssz" ]]; then
  echo "WARNING: ${APP_DIR}/network/consensus/genesis.ssz not found yet."
  echo "Run ${APP_DIR}/network/scripts/generate-validator-keys.sh and generate-genesis.sh before starting Lighthouse."
fi

chown -R tataservice:tataservice "${DATA_DIR}" "${APP_DIR}"
echo "[03-setup-node] Node initialization complete."
