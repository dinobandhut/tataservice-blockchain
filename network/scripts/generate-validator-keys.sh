#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# TataService Blockchain — Encrypted Validator Keystore Generator (EIP-2335)
# Security: Never stores mnemonics or keystore passwords in plaintext inside git.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
OUTPUT_DIR="${VALIDATOR_KEYS_DIR:-${ROOT_DIR}/data/validator_keys}"
VALIDATOR_COUNT="${GENESIS_VALIDATOR_COUNT:-4}"
WITHDRAWAL_ADDRESS="${TATA_VALIDATOR_OPS_ADDR:-}"
KEYSTORE_PASSWORD_FILE="${KEYSTORE_PASSWORD_FILE:-}"

if [[ -z "${WITHDRAWAL_ADDRESS}" ]]; then
  echo "ERROR: TATA_VALIDATOR_OPS_ADDR must be set to a valid 0x execution withdrawal address." >&2
  exit 1
fi

if [[ ! "${WITHDRAWAL_ADDRESS}" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
  echo "ERROR: Invalid withdrawal address format: ${WITHDRAWAL_ADDRESS}" >&2
  exit 1
fi

mkdir -p "${OUTPUT_DIR}"
chmod 700 "${OUTPUT_DIR}"

if [[ -z "${KEYSTORE_PASSWORD_FILE}" ]]; then
  KEYSTORE_PASSWORD_FILE="${OUTPUT_DIR}/.keystore_password"
  if [[ ! -f "${KEYSTORE_PASSWORD_FILE}" ]]; then
    read -r -s -p "Enter strong EIP-2335 keystore encryption passphrase (min 12 chars): " PW1
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
fi

chmod 600 "${KEYSTORE_PASSWORD_FILE}"

echo "Generating ${VALIDATOR_COUNT} encrypted EIP-2335 validator keystores using eth2-val-tools / staking-deposit-cli..."
if command -v deposit >/dev/null 2>&1; then
  deposit new-mnemonic \
    --num_validators "${VALIDATOR_COUNT}" \
    --chain mainnet \
    --execution_address "${WITHDRAWAL_ADDRESS}" \
    --folder "${OUTPUT_DIR}" \
    --keystore_password "$(cat "${KEYSTORE_PASSWORD_FILE}")"
elif command -v docker >/dev/null 2>&1; then
  docker run --rm -it \
    -v "${OUTPUT_DIR}:/keys" \
    ghcr.io/foundry-rs/foundry:latest true >/dev/null 2>&1 || true

  docker run --rm \
    -v "${OUTPUT_DIR}:/app/validator_keys" \
    -v "${KEYSTORE_PASSWORD_FILE}:/tmp/keystore_pw:ro" \
    --entrypoint /bin/bash \
    ethereum/staking-deposit-cli:latest \
    -c "deposit --non_interactive new-mnemonic \
      --num_validators ${VALIDATOR_COUNT} \
      --mnemonic_language english \
      --chain mainnet \
      --execution_address ${WITHDRAWAL_ADDRESS} \
      --folder /app \
      --keystore_password \$(cat /tmp/keystore_pw)"
else
  echo "ERROR: Neither 'deposit' CLI nor 'docker' is installed." >&2
  exit 1
fi

find "${OUTPUT_DIR}" -type f -name "keystore-*.json" -exec chmod 600 {} +
echo "Encrypted EIP-2335 validator keystores written to: ${OUTPUT_DIR}"
echo "IMPORTANT: Back up your mnemonic offline immediately and never commit ${OUTPUT_DIR} to version control."
