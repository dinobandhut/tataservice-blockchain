# TataService Blockchain — Backend, Indexer & Hardened RPC Gateway (Phase 3)

## Components
- **PostgreSQL 16 Schema (`sql/001_init.sql`)**: Normalized tables for blocks, transactions, event logs, addresses, verified Solidity contracts, Beacon Chain validators, and finality checkpoints.
- **Reorg-Safe Indexer (`src/indexer/chainIndexer.ts`)**: Syncs execution blocks, receipts, logs, and account balances from Geth (`8545`) while syncing finality checkpoints and validator statuses from Lighthouse (`5052`). Automatically rolls back orphaned blocks on parent-hash mismatch.
- **Hardened JSON-RPC Gateway (`POST /rpc`)**:
  - Method allowlist (`eth_chainId`, `eth_blockNumber`, `eth_getBlockByNumber`, `eth_getBalance`, `eth_getTransactionByHash`, `eth_sendRawTransaction`, `eth_getTransactionReceipt`, `eth_call`, `eth_estimateGas`, `eth_gasPrice`, `eth_getLogs`, `net_version`, `web3_clientVersion`, plus MetaMask gas/account helpers).
  - Blocks `admin_*`, `debug_*`, `personal_*`, `miner_*`, `txpool_*`, `engine_*`.
  - Validates ECDSA signature & Chain ID (`810161`) on `eth_sendRawTransaction` before forwarding.
  - Enforces `eth_getLogs` block-range cap and per-IP rate limiting.
- **Solidity Contract Verifier (`POST /api/v1/contracts/verify`)**: Compiles Solidity source via `solc` Standard JSON Input, strips CBOR metadata, compares bytecode against `eth_getCode`, and stores verified ABIs.
- **Authenticated Admin Routes (`GET /api/v1/admin/health`, `POST /api/v1/admin/reindex`)**: Protected via HS256 JWT Bearer tokens (`ADMIN_API_JWT_SECRET`).

## Local / Server Run
```bash
cd backend
npm install
npm run migrate
npm run dev
```
