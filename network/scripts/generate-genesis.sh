#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# TataService Blockchain — Deterministic Execution & Consensus Genesis Builder
# Ensures Execution alloc + Beacon genesis validator stake == 1,000,000,000 TATA
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
EXEC_DIR="${ROOT_DIR}/network/execution"
CONSENSUS_DIR="${ROOT_DIR}/network/consensus"
DATA_DIR="${ROOT_DIR}/data"
JWT_FILE="${DATA_DIR}/jwt/jwtsecret"

GENESIS_VALIDATOR_COUNT="${GENESIS_VALIDATOR_COUNT:-4}"
VALIDATOR_STAKE_TATA="${VALIDATOR_STAKE_TATA:-32}"
GENESIS_TIMESTAMP="${GENESIS_TIMESTAMP:-$(date +%s)}"

TATA_STAKING_REWARDS_ADDR="${TATA_STAKING_REWARDS_ADDR:-0x7a7a000000000000000000000000000000000001}"
TATA_ECOSYSTEM_ADDR="${TATA_ECOSYSTEM_ADDR:-0x7a7a000000000000000000000000000000000002}"
TATA_TREASURY_ADDR="${TATA_TREASURY_ADDR:-0x7a7a000000000000000000000000000000000003}"
TATA_LIQUIDITY_ADDR="${TATA_LIQUIDITY_ADDR:-0x7a7a000000000000000000000000000000000004}"
TATA_VALIDATOR_OPS_ADDR="${TATA_VALIDATOR_OPS_ADDR:-0x7a7a000000000000000000000000000000000005}"

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
const path = require("path");

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

# Sync MIN_GENESIS_TIME & MIN_GENESIS_ACTIVE_VALIDATOR_COUNT in config.yaml
sed -i.bak -E "s/^MIN_GENESIS_TIME:.*/MIN_GENESIS_TIME: ${GENESIS_TIMESTAMP}/" "${CONSENSUS_DIR}/config.yaml"
sed -i.bak -E "s/^MIN_GENESIS_ACTIVE_VALIDATOR_COUNT:.*/MIN_GENESIS_ACTIVE_VALIDATOR_COUNT: ${GENESIS_VALIDATOR_COUNT}/" "${CONSENSUS_DIR}/config.yaml"
rm -f "${CONSENSUS_DIR}/config.yaml.bak"

echo "Validating mathematical supply invariant..."
GENESIS_VALIDATOR_COUNT="${GENESIS_VALIDATOR_COUNT}" VALIDATOR_STAKE_TATA="${VALIDATOR_STAKE_TATA}" \
  node "${SCRIPT_DIR}/verify-genesis-supply.mjs"

DEPOSIT_DATA_JSON="$(find "${DATA_DIR}/validator_keys" -maxdepth 2 -name 'deposit_data-*.json' 2>/dev/null | head -n 1 || true)"

if [[ -n "${DEPOSIT_DATA_JSON}" ]] && command -v docker >/dev/null 2>&1; then
  echo "Generating Lighthouse genesis.ssz from deposit_data (${DEPOSIT_DATA_JSON})..."
  docker run --rm \
    -v "${EXEC_DIR}:/exec:ro" \
    -v "${CONSENSUS_DIR}:/consensus" \
    -v "${DEPOSIT_DATA_JSON}:/tmp/deposit_data.json:ro" \
    protolambda/eth2-testnet-genesis:latest \
    deneb \
    --config /consensus/config.yaml \
    --eth1-config /exec/genesis.json \
    --preset-phase0 mainnet \
    --preset-altair mainnet \
    --preset-bellatrix mainnet \
    --preset-capella mainnet \
    --preset-deneb mainnet \
    --tranches-dir /tmp/tranches \
    --state-output /consensus/genesis.ssz
  echo "Generated ${CONSENSUS_DIR}/genesis.ssz successfully."
else
  echo "NOTICE: No deposit_data-*.json found in ${DATA_DIR}/validator_keys (or Docker unavailable)."
  echo "Run ./network/scripts/generate-validator-keys.sh first, then re-run generate-genesis.sh to emit genesis.ssz."
fi
