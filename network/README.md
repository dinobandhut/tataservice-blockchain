# TataService Blockchain — Network & Genesis Specification (Phase 1)

## Network Identity
- **Name:** TataService Blockchain (Tata Chain)
- **Native Coin:** `TATA` (18 decimals, `1 TATA = 10^18 Wei`)
- **Chain ID:** `810161` (`0xc5c71`)
- **Total Genesis Supply:** `1,000,000,000 TATA` (`10^27 Wei`)
- **Execution Client:** Go-Ethereum (`geth v1.14.12`) — Cancun EVM active from Block 0
- **Consensus Client:** Lighthouse (`v6.0.1`) — Ethereum PoS (Altair, Bellatrix, Capella, Deneb active from Epoch 0)

## Option A Supply & Validator Architecture
To maintain **100% protocol compatibility** with unmodified upstream `geth` and `lighthouse` binaries while enforcing the **1,000,000,000 TATA** supply design:

1. **Exact Genesis Accounting**: `network/scripts/generate-genesis.sh` dynamically adjusts the Execution `alloc` so that:
   `Sum(Execution alloc) + (GENESIS_VALIDATOR_COUNT * VALIDATOR_STAKE_TATA) == 1,000,000,000 TATA`.
2. **Staking & Rewards Reserve**: `240,000,000 TATA` is allocated to the Staking & Delegator Rewards Reserve (`TataStakingPool.sol`, implemented in Phase 2) alongside `32,000 TATA` operator bonding / delegation support.
3. **Upstream Lighthouse Preset Note**: Official `sigp/lighthouse` images enforce the `mainnet` compile-time preset (`32` native coin effective balance per validator slot, `BASE_REWARD_FACTOR = 64`). Because of this, `config.yaml` sets `EJECTION_BALANCE: 16000000000` (`16 TATA`) so unmodified Lighthouse boots and finalizes cleanly, while the `TataStakingPool` contract handles `32,000 TATA` operator bonds and delegated staking on top of canonical PoS deposits. If you later choose to compile a custom Lighthouse fork with `BASE_REWARD_FACTOR = 0` and `MAX_EFFECTIVE_BALANCE = 32000_000000000`, keep in mind that doing so requires maintaining custom consensus binaries across all validators.

## Quick Start (Linux / Ubuntu 24.04 with Docker)
1. Configure operator addresses & DB passwords in `.env` (copied from `network/.env.node.example`).
2. Verify supply math:
   ```bash
   node network/scripts/verify-genesis-supply.mjs
   ```
3. Generate encrypted EIP-2335 validator keystores (never committed to git):
   ```bash
   chmod +x network/scripts/*.sh
   ./network/scripts/generate-validator-keys.sh
   ```
4. Generate JWT secret, `genesis.json`, and `genesis.ssz`:
   ```bash
   ./network/scripts/generate-genesis.sh
   ```
5. Boot the node stack:
   ```bash
   docker compose up -d
   ```
