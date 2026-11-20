-- =============================================================================
-- TataService Blockchain (Tata Chain) — PostgreSQL 16 Explorer & Indexer Schema
-- Chain ID: 810161 | Native Coin: TATA
-- =============================================================================

CREATE TABLE IF NOT EXISTS blocks (
  number BIGINT PRIMARY KEY,
  hash VARCHAR(66) NOT NULL UNIQUE,
  parent_hash VARCHAR(66) NOT NULL,
  timestamp BIGINT NOT NULL,
  miner VARCHAR(42) NOT NULL,
  gas_used NUMERIC(78, 0) NOT NULL,
  gas_limit NUMERIC(78, 0) NOT NULL,
  base_fee_per_gas NUMERIC(78, 0) NOT NULL DEFAULT 0,
  tx_count INTEGER NOT NULL DEFAULT 0,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  state_root VARCHAR(66) NOT NULL,
  transactions_root VARCHAR(66) NOT NULL,
  receipts_root VARCHAR(66) NOT NULL,
  extra_data TEXT NOT NULL DEFAULT '0x',
  finalized BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blocks_timestamp ON blocks (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_blocks_miner ON blocks (miner, number DESC);

CREATE TABLE IF NOT EXISTS transactions (
  hash VARCHAR(66) PRIMARY KEY,
  block_number BIGINT NOT NULL REFERENCES blocks(number) ON DELETE CASCADE,
  block_hash VARCHAR(66) NOT NULL,
  tx_index INTEGER NOT NULL,
  from_address VARCHAR(42) NOT NULL,
  to_address VARCHAR(42),
  value_wei NUMERIC(78, 0) NOT NULL,
  nonce BIGINT NOT NULL,
  gas_limit NUMERIC(78, 0) NOT NULL,
  gas_used NUMERIC(78, 0) NOT NULL DEFAULT 0,
  gas_price_wei NUMERIC(78, 0) NOT NULL DEFAULT 0,
  max_fee_per_gas NUMERIC(78, 0),
  max_priority_fee_per_gas NUMERIC(78, 0),
  effective_gas_price NUMERIC(78, 0) NOT NULL DEFAULT 0,
  tx_type SMALLINT NOT NULL DEFAULT 0,
  input_data TEXT NOT NULL DEFAULT '0x',
  status SMALLINT NOT NULL DEFAULT 1,
  contract_address VARCHAR(42),
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_txs_block_num ON transactions (block_number DESC, tx_index ASC);
CREATE INDEX IF NOT EXISTS idx_txs_from ON transactions (from_address, block_number DESC);
CREATE INDEX IF NOT EXISTS idx_txs_to ON transactions (to_address, block_number DESC);
CREATE INDEX IF NOT EXISTS idx_txs_contract ON transactions (contract_address) WHERE contract_address IS NOT NULL;

CREATE TABLE IF NOT EXISTS event_logs (
  id BIGSERIAL PRIMARY KEY,
  tx_hash VARCHAR(66) NOT NULL REFERENCES transactions(hash) ON DELETE CASCADE,
  block_number BIGINT NOT NULL REFERENCES blocks(number) ON DELETE CASCADE,
  log_index INTEGER NOT NULL,
  address VARCHAR(42) NOT NULL,
  topic0 VARCHAR(66),
  topic1 VARCHAR(66),
  topic2 VARCHAR(66),
  topic3 VARCHAR(66),
  data TEXT NOT NULL DEFAULT '0x',
  UNIQUE (tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS idx_logs_address ON event_logs (address, block_number DESC);
CREATE INDEX IF NOT EXISTS idx_logs_topic0 ON event_logs (topic0);
CREATE INDEX IF NOT EXISTS idx_logs_block ON event_logs (block_number DESC);

CREATE TABLE IF NOT EXISTS addresses (
  address VARCHAR(42) PRIMARY KEY,
  balance_wei NUMERIC(78, 0) NOT NULL DEFAULT 0,
  tx_count BIGINT NOT NULL DEFAULT 0,
  is_contract BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen_block BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS verified_contracts (
  address VARCHAR(42) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  compiler_version VARCHAR(64) NOT NULL,
  evm_version VARCHAR(32) NOT NULL DEFAULT 'cancun',
  optimization_used BOOLEAN NOT NULL DEFAULT TRUE,
  runs INTEGER NOT NULL DEFAULT 200,
  source_code TEXT NOT NULL,
  abi JSONB NOT NULL,
  constructor_args TEXT NOT NULL DEFAULT '',
  bytecode_hash VARCHAR(66) NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS validators (
  validator_index BIGINT PRIMARY KEY,
  pubkey VARCHAR(98) NOT NULL UNIQUE,
  withdrawal_credentials VARCHAR(66) NOT NULL,
  effective_balance_gwei BIGINT NOT NULL,
  balance_gwei BIGINT NOT NULL,
  status VARCHAR(32) NOT NULL,
  slashed BOOLEAN NOT NULL DEFAULT FALSE,
  activation_epoch BIGINT NOT NULL,
  exit_epoch BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_validators_status ON validators (status);

CREATE TABLE IF NOT EXISTS chain_checkpoints (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  latest_indexed_block BIGINT NOT NULL DEFAULT -1,
  finalized_block BIGINT NOT NULL DEFAULT 0,
  justified_epoch BIGINT NOT NULL DEFAULT 0,
  finalized_epoch BIGINT NOT NULL DEFAULT 0,
  total_txs BIGINT NOT NULL DEFAULT 0,
  avg_gas_price_wei NUMERIC(78, 0) NOT NULL DEFAULT 1000000000,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO chain_checkpoints (id, latest_indexed_block)
VALUES (1, -1)
ON CONFLICT (id) DO NOTHING;
