#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# TataService Blockchain — Encrypted Backup & Recovery Script
# Covers: validator keystores, slashing_protection.sqlite, genesis, .env, PostgreSQL
# Usage:
#   sudo bash 05-backup-and-restore.sh backup  /var/backups/tataservice
#   sudo bash 05-backup-and-restore.sh restore /var/backups/tataservice/tata-backup-YYYYMMDD.tar.gz.enc
# =============================================================================

if [[ "${EUID}" -ne 0 ]]; then
  echo "ERROR: Please run as root" >&2
  exit 1
fi

MODE="${1:-}"
TARGET="${2:-}"
APP_DIR="/opt/tataservice"
DATA_DIR="/var/lib/tataservice"

if [[ -z "${MODE}" ]] || [[ -z "${TARGET}" ]]; then
  echo "Usage: $0 <backup|restore> <directory_or_encrypted_archive>" >&2
  exit 1
fi

if [[ "${MODE}" == "backup" ]]; then
  mkdir -p "${TARGET}"
  chmod 700 "${TARGET}"
  STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
  WORK_DIR="$(mktemp -d)"
  trap 'rm -rf "${WORK_DIR}"' EXIT

  # Stop validator briefly to guarantee consistent slashing_protection.sqlite snapshot
  VC_WAS_ACTIVE=false
  if systemctl is-active --quiet lighthouse-vc-tata; then
    VC_WAS_ACTIVE=true
    systemctl stop lighthouse-vc-tata
  fi

  mkdir -p "${WORK_DIR}/validator_state" "${WORK_DIR}/config"
  if [[ -d "${DATA_DIR}/lighthouse-vc/validators" ]]; then
    cp -a "${DATA_DIR}/lighthouse-vc/validators" "${WORK_DIR}/validator_state/"
  fi
  cp -a "${APP_DIR}/.env" "${WORK_DIR}/config/" 2>/dev/null || true
  cp -a "${APP_DIR}/network" "${WORK_DIR}/config/" 2>/dev/null || true

  if [[ "${VC_WAS_ACTIVE}" == "true" ]]; then
    systemctl start lighthouse-vc-tata
  fi

  # PostgreSQL dump
  if [[ -f "${APP_DIR}/.env" ]]; then
    # shellcheck disable=SC1091
    source "${APP_DIR}/.env"
    su - postgres -c "pg_dump -Fc ${POSTGRES_DB:-tata_explorer}" > "${WORK_DIR}/postgres.dump"
  fi

  ARCHIVE_PATH="${TARGET}/tata-backup-${STAMP}.tar.gz.enc"
  echo "Encrypting backup to ${ARCHIVE_PATH} (enter backup encryption passphrase when prompted)..."
  tar -C "${WORK_DIR}" -czf - . | openssl enc -aes-256-cbc -pbkdf2 -salt -out "${ARCHIVE_PATH}"
  chmod 600 "${ARCHIVE_PATH}"
  echo "Encrypted backup created: ${ARCHIVE_PATH}"

elif [[ "${MODE}" == "restore" ]]; then
  if [[ ! -f "${TARGET}" ]]; then
    echo "ERROR: Backup archive not found: ${TARGET}" >&2
    exit 1
  fi

  WORK_DIR="$(mktemp -d)"
  trap 'rm -rf "${WORK_DIR}"' EXIT

  echo "Decrypting ${TARGET}..."
  openssl enc -d -aes-256-cbc -pbkdf2 -in "${TARGET}" | tar -C "${WORK_DIR}" -xzf -

  systemctl stop lighthouse-vc-tata tata-explorer-api 2>/dev/null || true

  if [[ -d "${WORK_DIR}/validator_state/validators" ]]; then
    mkdir -p "${DATA_DIR}/lighthouse-vc"
    rm -rf "${DATA_DIR}/lighthouse-vc/validators"
    cp -a "${WORK_DIR}/validator_state/validators" "${DATA_DIR}/lighthouse-vc/"
    chown -R tataservice:tataservice "${DATA_DIR}/lighthouse-vc"
  fi

  if [[ -f "${WORK_DIR}/config/.env" ]]; then
    cp -a "${WORK_DIR}/config/.env" "${APP_DIR}/.env"
    chmod 600 "${APP_DIR}/.env"
  fi

  if [[ -f "${WORK_DIR}/postgres.dump" ]] && [[ -f "${APP_DIR}/.env" ]]; then
    # shellcheck disable=SC1091
    source "${APP_DIR}/.env"
    su - postgres -c "pg_restore --clean --if-exists -d ${POSTGRES_DB:-tata_explorer}" < "${WORK_DIR}/postgres.dump"
  fi

  echo "Restore complete. Verify slashing protection DB before starting lighthouse-vc-tata."
else
  echo "ERROR: Unknown mode '${MODE}'. Use backup or restore." >&2
  exit 1
fi
