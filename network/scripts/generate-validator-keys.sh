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

GENESIS_GEN_IMAGE="${GENESIS_GEN_IMAGE:-ethpandaops/ethereum-genesis-generator:master}"
OUTPUT_DIR="${VALIDATOR_KEYS_DIR:-${ROOT_DIR}/data/validator_keys}"
VALIDATOR_COUNT="${GENESIS_VALIDATOR_COUNT:-4}"
WITHDRAWAL_ADDRESS="${TATA_VALIDATOR_OPS_ADDR:-0x7a7a000000000000000000000000000000000005}"

if [[ ! "${WITHDRAWAL_ADDRESS}" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
  echo "ERROR: Invalid TATA_VALIDATOR_OPS_ADDR format: ${WITHDRAWAL_ADDRESS}" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: Docker is required to run eth2-val-tools." >&2
  exit 1
fi

mkdir -p "${OUTPUT_DIR}"
chmod 700 "${OUTPUT_DIR}"

MNEMONIC="${VALIDATOR_MNEMONIC:-}"
if [[ -z "${MNEMONIC}" ]]; then
  MNEMONIC="$(node -e '
    const crypto = require("crypto");
    const { Mnemonic } = require("ethers");
    console.log(Mnemonic.fromEntropy(crypto.randomBytes(32)).phrase);
  ' 2>/dev/null || docker run --rm --entrypoint eth2-val-tools "${GENESIS_GEN_IMAGE}" mnemonic)"
  echo "========================================================================="
  echo "OFFLINE BACKUP REQUIRED — WRITE DOWN THIS VALIDATOR MNEMONIC SECURELY:"
  echo "${MNEMONIC}"
  echo "========================================================================="
fi

echo "Generating ${VALIDATOR_COUNT} encrypted EIP-2335 keystores using ${GENESIS_GEN_IMAGE}..."
rm -rf "${OUTPUT_DIR}/generated" "${OUTPUT_DIR}/keys" "${OUTPUT_DIR}/secrets" 2>/dev/null || \
  docker run --rm -v "${OUTPUT_DIR}:/out" --entrypoint rm "${GENESIS_GEN_IMAGE}" -rf /out/generated /out/keys /out/secrets

docker run --rm \
  -u "$(id -u):$(id -g)" \
  -e GOMAXPROCS=1 \
  -v "${OUTPUT_DIR}:/out" \
  --entrypoint eth2-val-tools \
  "${GENESIS_GEN_IMAGE}" \
  keystores \
  --out-loc /out/generated \
  --source-min 0 \
  --source-max "${VALIDATOR_COUNT}" \
  --source-mnemonic "${MNEMONIC}"

mkdir -p "${OUTPUT_DIR}/keys" "${OUTPUT_DIR}/secrets"
cp -a "${OUTPUT_DIR}/generated/keys/." "${OUTPUT_DIR}/keys/"
cp -a "${OUTPUT_DIR}/generated/secrets/." "${OUTPUT_DIR}/secrets/"
chmod 700 "${OUTPUT_DIR}/keys" "${OUTPUT_DIR}/secrets"
find "${OUTPUT_DIR}/keys" -type f -exec chmod 600 {} +
find "${OUTPUT_DIR}/secrets" -type f -exec chmod 600 {} +

cat > "${OUTPUT_DIR}/.genesis_mnemonic.yaml" <<EOF
- mnemonic: "${MNEMONIC}"
  count: ${VALIDATOR_COUNT}
EOF
chmod 600 "${OUTPUT_DIR}/.genesis_mnemonic.yaml"

echo "Encrypted EIP-2335 validator keystores & secrets ready in ${OUTPUT_DIR}/{keys,secrets}"
