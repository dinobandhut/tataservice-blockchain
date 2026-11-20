#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# TataService Blockchain — Encrypted Validator Keystore Generator (EIP-2335)
# Security: Mnemonic is printed once for offline backup and never stored in git.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

if [[ -f "${ROOT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT_DIR}/.env"
  set +a
fi

OUTPUT_DIR="${VALIDATOR_KEYS_DIR:-${ROOT_DIR}/data/validator_keys}"
VALIDATOR_COUNT="${GENESIS_VALIDATOR_COUNT:-4}"
WITHDRAWAL_ADDRESS="${TATA_VALIDATOR_OPS_ADDR:-0x7a7a000000000000000000000000000000000005}"
KEYSTORE_PASSWORD_FILE="${KEYSTORE_PASSWORD_FILE:-${OUTPUT_DIR}/.keystore_password}"

if [[ ! "${WITHDRAWAL_ADDRESS}" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
  echo "ERROR: Invalid TATA_VALIDATOR_OPS_ADDR format: ${WITHDRAWAL_ADDRESS}" >&2
  exit 1
fi

mkdir -p "${OUTPUT_DIR}"
chmod 700 "${OUTPUT_DIR}"

if [[ ! -f "${KEYSTORE_PASSWORD_FILE}" ]]; then
  read -r -s -p "Enter strong EIP-2335 keystore passphrase (min 12 chars): " PW1
  echo
  read -r -s -p "Confirm keystore passphrase: " PW2
  echo
  if [[ "${PW1}" != "${PW2}" ]] || [[ ${#PW1} -lt 12 ]]; then
    echo "ERROR: Passphrases do not match or are shorter than 12 characters." >&2
    exit 1
  fi
  umask 077
  printf '%s' "${PW1}" > "${KEYSTORE_PASSWORD_FILE}"
  unset PW1 PW2
fi
chmod 600 "${KEYSTORE_PASSWORD_FILE}"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: Docker is required to run eth2-val-tools." >&2
  exit 1
fi

MNEMONIC="${VALIDATOR_MNEMONIC:-}"
if [[ -z "${MNEMONIC}" ]]; then
  MNEMONIC="$(node -e '
    const crypto = require("crypto");
    const { Mnemonic } = require("ethers");
    console.log(Mnemonic.fromEntropy(crypto.randomBytes(32)).phrase);
  ' 2>/dev/null || docker run --rm --entrypoint eth2-val-tools ethpandaops/ethereum-genesis-generator:latest mnemonic)"
  echo "========================================================================="
  echo "OFFLINE BACKUP REQUIRED — WRITE DOWN THIS VALIDATOR MNEMONIC SECURELY:"
  echo "${MNEMONIC}"
  echo "========================================================================="
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT
chmod 700 "${TMP_DIR}"

PASS_VAL="$(cat "${KEYSTORE_PASSWORD_FILE}")"

echo "Generating ${VALIDATOR_COUNT} encrypted EIP-2335 keystores..."
docker run --rm \
  -v "${OUTPUT_DIR}:/out" \
  --entrypoint eth2-val-tools \
  ethpandaops/ethereum-genesis-generator:latest \
  keystores \
  --out-loc /out/generated \
  --source-min 0 \
  --source-max "${VALIDATOR_COUNT}" \
  --source-mnemonic "${MNEMONIC}" \
  --withdrawal-address "${WITHDRAWAL_ADDRESS}" \
  --prysm-pass "${PASS_VAL}"

# Flatten keystore-*.json into OUTPUT_DIR for lighthouse account validator import
mkdir -p "${OUTPUT_DIR}/keys"
if [[ -d "${OUTPUT_DIR}/generated/keys" ]]; then
  cp -a "${OUTPUT_DIR}/generated/keys/." "${OUTPUT_DIR}/keys/"
fi
find "${OUTPUT_DIR}" -type f -name "keystore-*.json" -exec chmod 600 {} +

# Export deposit_data summary hash for genesis.ssz generation via ephemeral mnemonics.yaml
cat > "${OUTPUT_DIR}/.genesis_mnemonic.yaml" <<EOF
- mnemonic: "${MNEMONIC}"
  count: ${VALIDATOR_COUNT}
EOF
chmod 600 "${OUTPUT_DIR}/.genesis_mnemonic.yaml"

echo "Encrypted EIP-2335 validator keystores ready in ${OUTPUT_DIR}/keys"
echo "Delete ${OUTPUT_DIR}/.genesis_mnemonic.yaml after running generate-genesis.sh!"
