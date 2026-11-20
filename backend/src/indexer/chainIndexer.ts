import { env } from '../config/env';
import { query, withTransaction } from '../db/pool';
import {
  BeaconFinalityCheckpoints,
  BeaconValidatorEntry,
  gethRpcCall,
  lighthouseGet,
} from '../rpc/gethClient';
import { finalizedEpochGauge, indexedBlockGauge } from '../metrics/prometheus';

interface RpcBlock {
  number: string;
  hash: string;
  parentHash: string;
  timestamp: string;
  miner: string;
  gasUsed: string;
  gasLimit: string;
  baseFeePerGas?: string;
  size: string;
  stateRoot: string;
  transactionsRoot: string;
  receiptsRoot: string;
  extraData: string;
  transactions: RpcTransaction[];
}

interface RpcTransaction {
  hash: string;
  blockNumber: string;
  blockHash: string;
  transactionIndex: string;
  from: string;
  to: string | null;
  value: string;
  nonce: string;
  gas: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  type?: string;
  input: string;
}

interface RpcReceipt {
  transactionHash: string;
  gasUsed: string;
  effectiveGasPrice?: string;
  status?: string;
  contractAddress: string | null;
  logs: Array<{
    logIndex: string;
    address: string;
    topics: string[];
    data: string;
  }>;
}

function hexToBigIntStr(hex?: string | null): string {
  if (!hex) return '0';
  return BigInt(hex).toString(10);
}

function hexToNum(hex?: string | null): number {
  if (!hex) return 0;
  return Number(BigInt(hex));
}

export class ChainIndexer {
  private timer: NodeJS.Timeout | null = null;
  private syncing = false;
  private lastBeaconSyncMs = 0;

  async start(): Promise<void> {
    if (!env.INDEXER_ENABLED) {
      console.log('[indexer] Disabled via INDEXER_ENABLED=false');
      return;
    }
    console.log(`[indexer] Starting reorg-safe block & beacon indexer (poll=${env.INDEXER_POLL_MS}ms)`);
    await this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, env.INDEXER_POLL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<void> {
    if (this.syncing) return;
    this.syncing = true;

    try {
      const latestHex = await gethRpcCall<string>('eth_blockNumber');
      const chainHead = Number(BigInt(latestHex));

      const cpRes = await query<{ latest_indexed_block: string }>(
        'SELECT latest_indexed_block FROM chain_checkpoints WHERE id = 1'
      );
      let nextBlock = Number(cpRes.rows[0]?.latest_indexed_block ?? '-1') + 1;

      const batchLimit = 25;
      let processed = 0;

      while (nextBlock <= chainHead && processed < batchLimit) {
        const blockHex = '0x' + nextBlock.toString(16);
        const block = await gethRpcCall<RpcBlock | null>('eth_getBlockByNumber', [blockHex, true]);
        if (!block) break;

        // Reorg check against previously indexed parent
        if (nextBlock > 0) {
          const parentRes = await query<{ hash: string }>(
            'SELECT hash FROM blocks WHERE number = $1',
            [nextBlock - 1]
          );
          const dbParentHash = parentRes.rows[0]?.hash;
          if (dbParentHash && dbParentHash.toLowerCase() !== block.parentHash.toLowerCase()) {
            const rollbackTarget = Math.max(0, nextBlock - 5);
            console.warn(`[indexer] Reorg detected at block ${nextBlock}! Rolling back to block ${rollbackTarget}`);
            await this.rollbackTo(rollbackTarget);
            nextBlock = rollbackTarget + 1;
            continue;
          }
        }

        await this.indexBlock(block);
        indexedBlockGauge.set(nextBlock);
        nextBlock += 1;
        processed += 1;
      }

      if (Date.now() - this.lastBeaconSyncMs >= 15_000) {
        await this.syncConsensusState();
        this.lastBeaconSyncMs = Date.now();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[indexer] Sync cycle skipped:', msg);
    } finally {
      this.syncing = false;
    }
  }

  async rollbackTo(keepUpToBlock: number): Promise<void> {
    await withTransaction(async (client) => {
      await client.query('DELETE FROM blocks WHERE number > $1', [keepUpToBlock]);
      const countRes = await client.query<{ cnt: string }>('SELECT COUNT(*)::text AS cnt FROM transactions');
      await client.query(
        'UPDATE chain_checkpoints SET latest_indexed_block = $1, total_txs = $2, updated_at = NOW() WHERE id = 1',
        [keepUpToBlock, Number(countRes.rows[0]?.cnt ?? '0')]
      );
    });
  }

  async indexBlock(block: RpcBlock): Promise<void> {
    const blockNum = hexToNum(block.number);
    const blockTs = hexToNum(block.timestamp);
    const touchedAddresses = new Set<string>([block.miner.toLowerCase()]);

    const receipts = new Map<string, RpcReceipt>();
    for (const tx of block.transactions) {
      const receipt = await gethRpcCall<RpcReceipt | null>('eth_getTransactionReceipt', [tx.hash]);
      if (receipt) {
        receipts.set(tx.hash.toLowerCase(), receipt);
      }
      touchedAddresses.add(tx.from.toLowerCase());
      if (tx.to) touchedAddresses.add(tx.to.toLowerCase());
      if (receipt?.contractAddress) touchedAddresses.add(receipt.contractAddress.toLowerCase());
    }

    const addressSnapshots: Array<{
      address: string;
      balanceWei: string;
      txCount: number;
      isContract: boolean;
    }> = [];

    for (const addr of touchedAddresses) {
      if (addr === '0x0000000000000000000000000000000000000000') continue;
      const [balHex, nonceHex, codeHex] = await Promise.all([
        gethRpcCall<string>('eth_getBalance', [addr, 'latest']),
        gethRpcCall<string>('eth_getTransactionCount', [addr, 'latest']),
        gethRpcCall<string>('eth_getCode', [addr, 'latest']),
      ]);
      addressSnapshots.push({
        address: addr,
        balanceWei: hexToBigIntStr(balHex),
        txCount: hexToNum(nonceHex),
        isContract: Boolean(codeHex && codeHex !== '0x'),
      });
    }

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO blocks (
          number, hash, parent_hash, timestamp, miner, gas_used, gas_limit,
          base_fee_per_gas, tx_count, size_bytes, state_root, transactions_root, receipts_root, extra_data
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (number) DO UPDATE SET
          hash = EXCLUDED.hash,
          parent_hash = EXCLUDED.parent_hash,
          timestamp = EXCLUDED.timestamp,
          miner = EXCLUDED.miner,
          gas_used = EXCLUDED.gas_used,
          tx_count = EXCLUDED.tx_count`,
        [
          blockNum,
          block.hash.toLowerCase(),
          block.parentHash.toLowerCase(),
          blockTs,
          block.miner.toLowerCase(),
          hexToBigIntStr(block.gasUsed),
          hexToBigIntStr(block.gasLimit),
          hexToBigIntStr(block.baseFeePerGas),
          block.transactions.length,
          hexToNum(block.size),
          block.stateRoot.toLowerCase(),
          block.transactionsRoot.toLowerCase(),
          block.receiptsRoot.toLowerCase(),
          block.extraData,
        ]
      );

      for (const tx of block.transactions) {
        const receipt = receipts.get(tx.hash.toLowerCase());
        const status = receipt?.status !== undefined ? hexToNum(receipt.status) : 1;
        const gasUsed = hexToBigIntStr(receipt?.gasUsed);
        const effPrice = hexToBigIntStr(receipt?.effectiveGasPrice ?? tx.gasPrice);

        await client.query(
          `INSERT INTO transactions (
            hash, block_number, block_hash, tx_index, from_address, to_address,
            value_wei, nonce, gas_limit, gas_used, gas_price_wei, max_fee_per_gas,
            max_priority_fee_per_gas, effective_gas_price, tx_type, input_data,
            status, contract_address, timestamp
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
          ON CONFLICT (hash) DO NOTHING`,
          [
            tx.hash.toLowerCase(),
            blockNum,
            block.hash.toLowerCase(),
            hexToNum(tx.transactionIndex),
            tx.from.toLowerCase(),
            tx.to ? tx.to.toLowerCase() : null,
            hexToBigIntStr(tx.value),
            hexToNum(tx.nonce),
            hexToBigIntStr(tx.gas),
            gasUsed,
            hexToBigIntStr(tx.gasPrice),
            tx.maxFeePerGas ? hexToBigIntStr(tx.maxFeePerGas) : null,
            tx.maxPriorityFeePerGas ? hexToBigIntStr(tx.maxPriorityFeePerGas) : null,
            effPrice,
            hexToNum(tx.type),
            tx.input,
            status,
            receipt?.contractAddress ? receipt.contractAddress.toLowerCase() : null,
            blockTs,
          ]
        );

        if (receipt?.logs) {
          for (const log of receipt.logs) {
            await client.query(
              `INSERT INTO event_logs (
                tx_hash, block_number, log_index, address, topic0, topic1, topic2, topic3, data
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
              ON CONFLICT (tx_hash, log_index) DO NOTHING`,
              [
                tx.hash.toLowerCase(),
                blockNum,
                hexToNum(log.logIndex),
                log.address.toLowerCase(),
                log.topics[0]?.toLowerCase() ?? null,
                log.topics[1]?.toLowerCase() ?? null,
                log.topics[2]?.toLowerCase() ?? null,
                log.topics[3]?.toLowerCase() ?? null,
                log.data,
              ]
            );
          }
        }
      }

      for (const snap of addressSnapshots) {
        await client.query(
          `INSERT INTO addresses (address, balance_wei, tx_count, is_contract, last_seen_block, updated_at)
           VALUES ($1,$2,$3,$4,$5,NOW())
           ON CONFLICT (address) DO UPDATE SET
             balance_wei = EXCLUDED.balance_wei,
             tx_count = EXCLUDED.tx_count,
             is_contract = EXCLUDED.is_contract,
             last_seen_block = GREATEST(addresses.last_seen_block, EXCLUDED.last_seen_block),
             updated_at = NOW()`,
          [snap.address, snap.balanceWei, snap.txCount, snap.isContract, blockNum]
        );
      }

      await client.query(
        `UPDATE chain_checkpoints
         SET latest_indexed_block = GREATEST(latest_indexed_block, $1),
             total_txs = total_txs + $2,
             avg_gas_price_wei = CASE WHEN $3::numeric > 0 THEN $3::numeric ELSE avg_gas_price_wei END,
             updated_at = NOW()
         WHERE id = 1`,
        [blockNum, block.transactions.length, hexToBigIntStr(block.baseFeePerGas)]
      );
    });
  }

  async syncConsensusState(): Promise<void> {
    const [checkpoints, validatorsResp, finalizedExecBlock] = await Promise.all([
      lighthouseGet<BeaconFinalityCheckpoints>('/eth/v1/beacon/states/head/finality_checkpoints'),
      lighthouseGet<{ data: BeaconValidatorEntry[] }>('/eth/v1/beacon/states/head/validators'),
      gethRpcCall<RpcBlock | null>('eth_getBlockByNumber', ['finalized', false]).catch(() => null),
    ]);

    const finalizedEpoch = checkpoints ? Number(checkpoints.data.finalized.epoch) : 0;
    const justifiedEpoch = checkpoints ? Number(checkpoints.data.current_justified.epoch) : 0;
    const finalizedBlockNum = finalizedExecBlock ? hexToNum(finalizedExecBlock.number) : 0;

    if (finalizedEpoch > 0) {
      finalizedEpochGauge.set(finalizedEpoch);
    }

    await withTransaction(async (client) => {
      if (finalizedBlockNum > 0) {
        await client.query('UPDATE blocks SET finalized = TRUE WHERE number <= $1 AND finalized = FALSE', [
          finalizedBlockNum,
        ]);
      }

      await client.query(
        `UPDATE chain_checkpoints
         SET finalized_block = GREATEST(finalized_block, $1),
             justified_epoch = GREATEST(justified_epoch, $2),
             finalized_epoch = GREATEST(finalized_epoch, $3),
             updated_at = NOW()
         WHERE id = 1`,
        [finalizedBlockNum, justifiedEpoch, finalizedEpoch]
      );

      if (validatorsResp?.data) {
        for (const v of validatorsResp.data) {
          await client.query(
            `INSERT INTO validators (
              validator_index, pubkey, withdrawal_credentials, effective_balance_gwei,
              balance_gwei, status, slashed, activation_epoch, exit_epoch, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
            ON CONFLICT (validator_index) DO UPDATE SET
              effective_balance_gwei = EXCLUDED.effective_balance_gwei,
              balance_gwei = EXCLUDED.balance_gwei,
              status = EXCLUDED.status,
              slashed = EXCLUDED.slashed,
              exit_epoch = EXCLUDED.exit_epoch,
              updated_at = NOW()`,
            [
              Number(v.index),
              v.validator.pubkey.toLowerCase(),
              v.validator.withdrawal_credentials.toLowerCase(),
              Number(v.validator.effective_balance),
              Number(v.balance),
              v.status,
              v.validator.slashed,
              Number(v.validator.activation_epoch),
              Number(v.validator.exit_epoch),
            ]
          );
        }
      }
    });
  }
}
