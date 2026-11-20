#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# TataService Blockchain — Deterministic Execution & Consensus Genesis Builder
# Ensures Execution alloc + Beacon genesis validator stake == 1,000,000,000 TATA
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
EXEC_DIR="${ROOT_DIR}/network/execution"
CONSENSUS_DIR="${ROOT_DIR}/network/consensus"
DATA_DIR="${ROOT_DIR}/data"
JWT_FILE="${DATA_DIR}/jwt/jwtsecret"

export GENESIS_VALIDATOR_COUNT="${GENESIS_VALIDATOR_COUNT:-4}"
export VALIDATOR_STAKE_TATA="${VALIDATOR_STAKE_TATA:-32}"
export GENESIS_TIMESTAMP="${GENESIS_TIMESTAMP:-$(date +%s)}"

export TATA_STAKING_REWARDS_ADDR="${TATA_STAKING_REWARDS_ADDR:-0x7a7a000000000000000000000000000000000001}"
export TATA_ECOSYSTEM_ADDR="${TATA_ECOSYSTEM_ADDR:-0x7a7a000000000000000000000000000000000002}"
export TATA_TREASURY_ADDR="${TATA_TREASURY_ADDR:-0x7a7a000000000000000000000000000000000003}"
export TATA_LIQUIDITY_ADDR="${TATA_LIQUIDITY_ADDR:-0x7a7a000000000000000000000000000000000004}"
export TATA_VALIDATOR_OPS_ADDR="${TATA_VALIDATOR_OPS_ADDR:-0x7a7a000000000000000000000000000000000005}"

mkdir -p "${DATA_DIR}/jwt" "${DATA_DIR}/geth" "${DATA_DIR}/lighthouse-bn" "${DATA_DIR}/lighthouse-vc"
chmod 700 "${DATA_DIR}/jwt"

if [[ ! -f "${JWT_FILE}" ]]; then
  umask 077
  openssl rand -hex 32 | tr -d '\n' > "${JWT_FILE}"
  echo "Generated 256-bit Engine API JWT secret at ${JWT_FILE}"
fi
chmod 600 "${JWT_FILE}"

echo "Updating ${EXEC_DIR}/genesis.json with exact 1,000,000,000 TATA allocation..."
node -e '
const fs = require("fs");
const genesisPath = process.argv[1];
const genesis = JSON.parse(fs.readFileSync(genesisPath, "utf8"));

const WEI = 10n ** 18n;
const TOTAL_SUPPLY = 1_000_000_000n * WEI;
const valCount = BigInt(process.env.GENESIS_VALIDATOR_COUNT || "4");
const valStake = BigInt(process.env.VALIDATOR_STAKE_TATA || "32");
const beaconStake = valCount * valStake * WEI;

const stakingRewards = 240_000_000n * WEI;
const ecosystem = 300_000_000n * WEI;
const treasury = 250_000_000n * WEI;
const liquidity = 200_000_000n * WEI;
const ops = TOTAL_SUPPLY - beaconStake - stakingRewards - ecosystem - treasury - liquidity;

if (ops < 0n) {
  throw new Error("Genesis validator stake exceeds available operations allocation");
}

const ts = BigInt(process.env.GENESIS_TIMESTAMP || Math.floor(Date.now() / 1000));
genesis.timestamp = "0x" + ts.toString(16);

const eip4788Addr = "0x000F3df6D732807Ef1319fB7B8bB8522d0Beac02";
const eip4788 = genesis.alloc[eip4788Addr];
genesis.alloc = {
  [eip4788Addr]: eip4788,
  [process.env.TATA_STAKING_REWARDS_ADDR]: { balance: "0x" + stakingRewards.toString(16) },
  [process.env.TATA_ECOSYSTEM_ADDR]: { balance: "0x" + ecosystem.toString(16) },
  [process.env.TATA_TREASURY_ADDR]: { balance: "0x" + treasury.toString(16) },
  [process.env.TATA_LIQUIDITY_ADDR]: { balance: "0x" + liquidity.toString(16) },
  [process.env.TATA_VALIDATOR_OPS_ADDR]: { balance: "0x" + ops.toString(16) }
};

fs.writeFileSync(genesisPath, JSON.stringify(genesis, null, 2) + "\n");
console.log("Updated genesis.json timestamp=" + genesis.timestamp + " beaconStakeTATA=" + (beaconStake / WEI).toString());
' "${EXEC_DIR}/genesis.json"

sed -i.bak -E "s/^MIN_GENESIS_TIME:.*/MIN_GENESIS_TIME: ${GENESIS_TIMESTAMP}/" "${CONSENSUS_DIR}/config.yaml"
sed -i.bak -E "s/^MIN_GENESIS_ACTIVE_VALIDATOR_COUNT:.*/MIN_GENESIS_ACTIVE_VALIDATOR_COUNT: ${GENESIS_VALIDATOR_COUNT}/" "${CONSENSUS_DIR}/config.yaml"
rm -f "${CONSENSUS_DIR}/config.yaml.bak"

echo "Validating mathematical supply invariant..."
node "${SCRIPT_DIR}/verify-genesis-supply.mjs"

MNEMONIC_YAML="${DATA_DIR}/validator_keys/.genesis_mnemonic.yaml"
if [[ -f "${MNEMONIC_YAML}" ]] && command -v docker >/dev/null 2>&1; then
  echo "Generating Lighthouse genesis.ssz using ${GENESIS_GEN_IMAGE}..."
  docker run --rm \
    -v "${EXEC_DIR}:/exec:ro" \
    -v "${CONSENSUS_DIR}:/consensus" \
    -v "${MNEMONIC_YAML}:/tmp/mnemonics.yaml:ro" \
    --entrypoint eth2-testnet-genesis \
    "${GENESIS_GEN_IMAGE}" \
    deneb \
    --config /consensus/config.yaml \
    --eth1-config /exec/genesis.json \
    --preset-phase0 mainnet \
    --preset-altair mainnet \
    --preset-bellatrix mainnet \
    --preset-capella mainnet \
    --preset-deneb mainnet \
    --mnemonics /tmp/mnemonics.yaml \
    --tranches-dir /tmp/tranches \
    --state-output /consensus/genesis.ssz

  rm -f "${MNEMONIC_YAML}"
  echo "Generated ${CONSENSUS_DIR}/genesis.ssz and removed ephemeral mnemonic yaml."
else
  echo "NOTICE: ${MNEMONIC_YAML} not found (or Docker unavailable)."
  echo "Run ./network/scripts/generate-validator-keys.sh first, then re-run generate-genesis.sh."
fi
