# TataService Blockchain (Tata Chain)

EVM-compatible Layer-1 Proof-of-Stake blockchain ecosystem powered by **Go-Ethereum (Geth)** and **Lighthouse**, with **PostgreSQL** indexing, **Solidity** core staking/token contracts, **Tata Explorer** React UI, **Prometheus/Grafana** monitoring, and **Ubuntu 24.04 LTS** deployment automation.

## Network Specification
- **Blockchain Name:** TataService Blockchain (`Tata Chain`)
- **Native Coin:** `TATA` (18 decimals, native gas & staking coin — not an ERC-20)
- **Chain ID:** `810161` (`0xc5c71`)
- **Total Supply:** `1,000,000,000 TATA` (`10^27 Wei`)
- **Execution Client:** Go-Ethereum (`v1.14.12`, Cancun EVM active from Block 0)
- **Consensus Client:** Lighthouse (`v6.0.1`, PoS Altair/Bellatrix/Capella/Deneb active from Epoch 0)

## Repository Map
- `network/` — `genesis.json`, Lighthouse `config.yaml`, EIP-2335 validator keygen & genesis SSZ builder, supply verifier
- `contracts/` — `DepositContract.sol`, `TataStakingPool.sol`, `TataWithdrawalVault.sol`, `WTATA.sol`, `TataERC20/721/1155`, Foundry tests
- `backend/` — PostgreSQL 16 schema, reorg-safe block/beacon indexer, hardened JSON-RPC gateway, `solc` contract verifier, JWT admin routes
- `src/` — **Tata Explorer** React + TypeScript UI with real JSON-RPC/API integration & MetaMask `wallet_addEthereumChain`
- `monitoring/` — Prometheus scrape & alert rules, Grafana datasource & dashboard provisioning
- `deploy/ubuntu-24.04/` — Hardening, client install, node init, systemd units, hardened Nginx config, encrypted backup/restore
- `tests/` — Automated security hardening, JSON-RPC compliance, and end-to-end transaction tests
- `docs/` — Ubuntu 24.04 deployment, MetaMask/RPC, and validator guides

## Verification Commands
```bash
# 1. Verify exact 1,000,000,000 TATA genesis supply & Chain ID 810161
node network/scripts/verify-genesis-supply.mjs

# 2. Run automated RPC security & JWT auth tests
npx tsx --test tests/security-hardening.test.ts

# 3. Build Tata Explorer frontend
npm run build && npm run lint
```
