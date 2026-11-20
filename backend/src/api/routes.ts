import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { query } from '../db/pool';
import { gethRpcCall } from '../rpc/gethClient';
import { verifyAndStoreContract } from '../verifier/contractVerifier';

const AddressParam = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid EVM address');
const HashParam = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Invalid 32-byte hash');

const VerifyContractSchema = z.object({
  address: AddressParam,
  contractName: z.string().min(1).max(128),
  compilerVersion: z.string().min(1).max(64).default('0.8.24'),
  evmVersion: z.string().min(1).max(32).default('cancun'),
  optimizationUsed: z.boolean().default(true),
  runs: z.number().int().min(0).max(1_000_000).default(200),
  sourceCode: z.string().min(10).max(512_000),
  constructorArgs: z.string().max(16_384).optional().default(''),
});

export function createExplorerRouter(): Router {
  const router = Router();

  router.get('/stats', async (_req: Request, res: Response) => {
    const [cpRes, valStatsRes, gasHex] = await Promise.all([
      query<{
        latest_indexed_block: string;
        finalized_block: string;
        justified_epoch: string;
        finalized_epoch: string;
        total_txs: string;
        avg_gas_price_wei: string;
        updated_at: string;
      }>('SELECT * FROM chain_checkpoints WHERE id = 1'),
      query<{ active_count: string; total_staked_gwei: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE status LIKE 'active%')::text AS active_count,
           COALESCE(SUM(effective_balance_gwei) FILTER (WHERE status LIKE 'active%'), 0)::text AS total_staked_gwei
         FROM validators`
      ),
      gethRpcCall<string>('eth_gasPrice').catch(() => null),
    ]);

    const cp = cpRes.rows[0];
    const valStats = valStatsRes.rows[0];

    res.json({
      chainName: 'TataService Blockchain',
      symbol: 'TATA',
      chainId: env.CHAIN_ID,
      totalSupplyTata: env.TOTAL_SUPPLY_TATA,
      latestBlock: Number(cp?.latest_indexed_block ?? -1),
      finalizedBlock: Number(cp?.finalized_block ?? 0),
      justifiedEpoch: Number(cp?.justified_epoch ?? 0),
      finalizedEpoch: Number(cp?.finalized_epoch ?? 0),
      totalTransactions: Number(cp?.total_txs ?? 0),
      gasPriceWei: gasHex ? BigInt(gasHex).toString(10) : cp?.avg_gas_price_wei ?? '1000000000',
      activeValidators: Number(valStats?.active_count ?? 0),
      totalStakedGwei: valStats?.total_staked_gwei ?? '0',
      updatedAt: cp?.updated_at ?? null,
    });
  });

  router.get('/blocks', async (req: Request, res: Response) => {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));
    const offset = Math.max(0, Number(req.query.offset ?? 0));

    const result = await query(
      `SELECT number, hash, parent_hash, timestamp, miner, gas_used, gas_limit,
              base_fee_per_gas, tx_count, size_bytes, finalized
       FROM blocks
       ORDER BY number DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({ blocks: result.rows, limit, offset });
  });

  router.get('/blocks/:identifier', async (req: Request, res: Response) => {
    const identifier = String(req.params.identifier ?? '').trim();
    const isHash = /^0x[0-9a-fA-F]{64}$/.test(identifier);
    const isNum = /^\d+$/.test(identifier);

    if (!isHash && !isNum) {
      res.status(400).json({ error: 'Block identifier must be a non-negative integer or 32-byte block hash' });
      return;
    }

    const blockRes = isHash
      ? await query('SELECT * FROM blocks WHERE hash = $1', [identifier.toLowerCase()])
      : await query('SELECT * FROM blocks WHERE number = $1', [Number(identifier)]);

    if (blockRes.rowCount === 0) {
      res.status(404).json({ error: 'Block not found' });
      return;
    }

    const block = blockRes.rows[0];
    const txsRes = await query(
      `SELECT hash, tx_index, from_address, to_address, value_wei, gas_used, effective_gas_price, status, contract_address
       FROM transactions WHERE block_number = $1 ORDER BY tx_index ASC`,
      [block.number]
    );

    res.json({ block, transactions: txsRes.rows });
  });

  router.get('/transactions', async (req: Request, res: Response) => {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));
    const offset = Math.max(0, Number(req.query.offset ?? 0));

    const result = await query(
      `SELECT hash, block_number, tx_index, from_address, to_address, value_wei,
              gas_used, effective_gas_price, status, contract_address, timestamp
       FROM transactions
       ORDER BY block_number DESC, tx_index DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({ transactions: result.rows, limit, offset });
  });

  router.get('/transactions/:hash', async (req: Request, res: Response) => {
    const parsed = HashParam.safeParse(req.params.hash);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid transaction hash' });
      return;
    }

    const txHash = parsed.data.toLowerCase();
    const txRes = await query('SELECT * FROM transactions WHERE hash = $1', [txHash]);
    if (txRes.rowCount === 0) {
      res.status(404).json({ error: 'Transaction not found' });
      return;
    }

    const logsRes = await query(
      'SELECT log_index, address, topic0, topic1, topic2, topic3, data FROM event_logs WHERE tx_hash = $1 ORDER BY log_index ASC',
      [txHash]
    );

    res.json({ transaction: txRes.rows[0], logs: logsRes.rows });
  });

  router.get('/address/:address', async (req: Request, res: Response) => {
    const parsed = AddressParam.safeParse(req.params.address);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid address format' });
      return;
    }

    const address = parsed.data.toLowerCase();
    const [addrRes, txsRes, contractRes, liveBalHex, liveNonceHex, liveCodeHex] = await Promise.all([
      query('SELECT * FROM addresses WHERE address = $1', [address]),
      query(
        `SELECT hash, block_number, from_address, to_address, value_wei, gas_used, effective_gas_price, status, timestamp
         FROM transactions
         WHERE from_address = $1 OR to_address = $1
         ORDER BY block_number DESC, tx_index DESC
         LIMIT 50`,
        [address]
      ),
      query('SELECT address, name, compiler_version, evm_version, optimization_used, runs, abi, verified_at FROM verified_contracts WHERE address = $1', [
        address,
      ]),
      gethRpcCall<string>('eth_getBalance', [address, 'latest']).catch(() => null),
      gethRpcCall<string>('eth_getTransactionCount', [address, 'latest']).catch(() => null),
      gethRpcCall<string>('eth_getCode', [address, 'latest']).catch(() => null),
    ]);

    const dbRow = addrRes.rows[0];
    const balanceWei = liveBalHex ? BigInt(liveBalHex).toString(10) : dbRow?.balance_wei ?? '0';
    const txCount = liveNonceHex ? Number(BigInt(liveNonceHex)) : Number(dbRow?.tx_count ?? 0);
    const isContract = liveCodeHex ? liveCodeHex !== '0x' : Boolean(dbRow?.is_contract);

    res.json({
      address,
      balanceWei,
      txCount,
      isContract,
      verifiedContract: contractRes.rows[0] ?? null,
      transactions: txsRes.rows,
    });
  });

  router.get('/contracts', async (_req: Request, res: Response) => {
    const result = await query(
      `SELECT address, name, compiler_version, evm_version, optimization_used, runs, bytecode_hash, verified_at
       FROM verified_contracts
       ORDER BY verified_at DESC
       LIMIT 100`
    );
    res.json({ contracts: result.rows });
  });

  router.get('/contracts/:address', async (req: Request, res: Response) => {
    const parsed = AddressParam.safeParse(req.params.address);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid contract address' });
      return;
    }

    const result = await query('SELECT * FROM verified_contracts WHERE address = $1', [
      parsed.data.toLowerCase(),
    ]);
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Verified contract not found' });
      return;
    }

    res.json({ contract: result.rows[0] });
  });

  router.post('/contracts/verify', async (req: Request, res: Response) => {
    const parsed = VerifyContractSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid verification payload', details: parsed.error.flatten() });
      return;
    }

    try {
      const verified = await verifyAndStoreContract(parsed.data);
      res.json({ status: 'verified', contract: verified });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Contract verification failed';
      res.status(400).json({ error: msg });
    }
  });

  router.get('/validators', async (_req: Request, res: Response) => {
    const result = await query(
      `SELECT validator_index, pubkey, withdrawal_credentials, effective_balance_gwei,
              balance_gwei, status, slashed, activation_epoch, exit_epoch, updated_at
       FROM validators
       ORDER BY validator_index ASC
       LIMIT 500`
    );
    res.json({ validators: result.rows });
  });

  router.get('/gas', async (_req: Request, res: Response) => {
    const [gasHex, recentBlocks] = await Promise.all([
      gethRpcCall<string>('eth_gasPrice').catch(() => null),
      query<{ number: string; base_fee_per_gas: string; gas_used: string; gas_limit: string; timestamp: string }>(
        'SELECT number, base_fee_per_gas, gas_used, gas_limit, timestamp FROM blocks ORDER BY number DESC LIMIT 20'
      ),
    ]);

    res.json({
      gasPriceWei: gasHex ? BigInt(gasHex).toString(10) : recentBlocks.rows[0]?.base_fee_per_gas ?? '1000000000',
      recentBlocks: recentBlocks.rows,
    });
  });

  router.get('/search', async (req: Request, res: Response) => {
    const q = String(req.query.q ?? '').trim();
    if (!q) {
      res.status(400).json({ error: 'Missing query parameter q' });
      return;
    }

    if (/^\d+$/.test(q)) {
      res.json({ type: 'block', target: `/blocks/${q}` });
      return;
    }

    if (/^0x[0-9a-fA-F]{40}$/.test(q)) {
      res.json({ type: 'address', target: `/address/${q.toLowerCase()}` });
      return;
    }

    if (/^0x[0-9a-fA-F]{64}$/.test(q)) {
      const txMatch = await query('SELECT hash FROM transactions WHERE hash = $1', [q.toLowerCase()]);
      if ((txMatch.rowCount ?? 0) > 0) {
        res.json({ type: 'transaction', target: `/transactions/${q.toLowerCase()}` });
        return;
      }
      const blockMatch = await query('SELECT number FROM blocks WHERE hash = $1', [q.toLowerCase()]);
      if ((blockMatch.rowCount ?? 0) > 0) {
        res.json({ type: 'block', target: `/blocks/${blockMatch.rows[0].number}` });
        return;
      }
    }

    res.status(404).json({ error: 'No matching block, transaction, or address found' });
  });

  return router;
}
