import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { Transaction } from 'ethers';
import { z } from 'zod';
import { env } from '../config/env';
import { gethRawForward } from './gethClient';
import { rpcRequestDurationSeconds, rpcRequestsTotal } from '../metrics/prometheus';

const ALLOWED_RPC_METHODS = new Set<string>([
  'eth_chainId',
  'eth_blockNumber',
  'eth_getBlockByNumber',
  'eth_getBlockByHash',
  'eth_getBalance',
  'eth_getTransactionByHash',
  'eth_sendRawTransaction',
  'eth_getTransactionReceipt',
  'eth_call',
  'eth_estimateGas',
  'eth_gasPrice',
  'eth_getLogs',
  'eth_feeHistory',
  'eth_maxPriorityFeePerGas',
  'eth_getCode',
  'eth_getTransactionCount',
  'eth_getStorageAt',
  'net_version',
  'web3_clientVersion',
  'web3_sha3',
]);

const BLOCKED_NAMESPACE_PREFIXES = ['admin_', 'debug_', 'personal_', 'miner_', 'txpool_', 'engine_'];

const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number(), z.null()]).optional().default(null),
  method: z.string().min(1).max(64),
  params: z.array(z.unknown()).max(16).optional().default([]),
});

function rpcError(id: string | number | null, code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function parseBlockTag(tag: unknown): bigint | 'latest' | 'earliest' | 'pending' | 'finalized' | 'safe' | null {
  if (typeof tag !== 'string') return null;
  if (tag === 'latest' || tag === 'earliest' || tag === 'pending' || tag === 'finalized' || tag === 'safe') {
    return tag;
  }
  if (/^0x[0-9a-fA-F]+$/.test(tag)) {
    return BigInt(tag);
  }
  return null;
}

function validateRpcPayload(reqItem: z.infer<typeof JsonRpcRequestSchema>): string | null {
  const { method, params } = reqItem;

  if (BLOCKED_NAMESPACE_PREFIXES.some((prefix) => method.startsWith(prefix))) {
    return `Privileged method "${method}" is forbidden on public RPC`;
  }

  if (!ALLOWED_RPC_METHODS.has(method)) {
    return `Method "${method}" is not supported on TataService RPC gateway`;
  }

  // Validate raw signed transaction inputs strictly before forwarding to Geth
  if (method === 'eth_sendRawTransaction') {
    const rawHex = params[0];
    if (typeof rawHex !== 'string' || !/^0x[0-9a-fA-F]+$/.test(rawHex) || rawHex.length > 262_146) {
      return 'Invalid raw transaction hex payload';
    }
    try {
      const parsedTx = Transaction.from(rawHex);
      if (!parsedTx.signature || !parsedTx.from) {
        return 'Transaction missing valid ECDSA signature';
      }
      if (parsedTx.chainId !== 0n && parsedTx.chainId !== BigInt(env.CHAIN_ID)) {
        return `Invalid transaction chainId ${parsedTx.chainId}; expected ${env.CHAIN_ID}`;
      }
    } catch {
      return 'Malformed RLP-encoded transaction';
    }
  }

  // Enforce bounded eth_getLogs queries to prevent node memory DoS
  if (method === 'eth_getLogs') {
    const filter = params[0];
    if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
      return 'eth_getLogs requires a filter object';
    }
    const f = filter as Record<string, unknown>;
    if (!f.blockHash) {
      const fromTag = parseBlockTag(f.fromBlock ?? 'latest');
      const toTag = parseBlockTag(f.toBlock ?? 'latest');
      if (typeof fromTag === 'bigint' && typeof toTag === 'bigint') {
        if (toTag < fromTag) {
          return 'eth_getLogs toBlock must be >= fromBlock';
        }
        if (toTag - fromTag > BigInt(env.RPC_MAX_LOG_RANGE)) {
          return `eth_getLogs range exceeds max ${env.RPC_MAX_LOG_RANGE} blocks`;
        }
      }
    }
  }

  return null;
}

export function createRpcGatewayRouter(): Router {
  const router = Router();

  const rpcLimiter = rateLimit({
    windowMs: env.RPC_RATE_LIMIT_WINDOW_MS,
    max: env.RPC_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: rpcError(null, -32005, 'Rate limit exceeded on TataService RPC gateway'),
  });

  router.post('/', rpcLimiter, async (req: Request, res: Response) => {
    const body = req.body;
    const isBatch = Array.isArray(body);

    if (isBatch && (body.length === 0 || body.length > 10)) {
      res.status(400).json(rpcError(null, -32600, 'Batch size must be between 1 and 10 requests'));
      return;
    }

    const items = isBatch ? body : [body];
    const validatedItems: z.infer<typeof JsonRpcRequestSchema>[] = [];

    for (const item of items) {
      const parsed = JsonRpcRequestSchema.safeParse(item);
      if (!parsed.success) {
        const rawId = item && typeof item === 'object' && 'id' in item ? (item.id as string | number | null) : null;
        rpcRequestsTotal.inc({ method: 'invalid', status: 'rejected' });
        res.status(400).json(rpcError(rawId, -32600, 'Invalid JSON-RPC 2.0 request'));
        return;
      }

      const policyErr = validateRpcPayload(parsed.data);
      if (policyErr) {
        rpcRequestsTotal.inc({ method: parsed.data.method, status: 'blocked' });
        const statusCode = BLOCKED_NAMESPACE_PREFIXES.some((p) => parsed.data.method.startsWith(p)) ? 403 : 400;
        res.status(statusCode).json(rpcError(parsed.data.id, -32601, policyErr));
        return;
      }
      validatedItems.push(parsed.data);
    }

    const primaryMethod = validatedItems.length === 1 ? validatedItems[0].method : 'batch';
    const endTimer = rpcRequestDurationSeconds.startTimer({ method: primaryMethod });

    try {
      const forwardPayload = isBatch ? validatedItems : validatedItems[0];
      const { status, data } = await gethRawForward(forwardPayload);
      for (const item of validatedItems) {
        rpcRequestsTotal.inc({ method: item.method, status: 'ok' });
      }
      res.status(status).json(data);
    } catch (err) {
      for (const item of validatedItems) {
        rpcRequestsTotal.inc({ method: item.method, status: 'upstream_error' });
      }
      const message = err instanceof Error ? err.message : 'Upstream execution client unavailable';
      res.status(502).json(rpcError(validatedItems[0]?.id ?? null, -32603, message));
    } finally {
      endTimer();
    }
  });

  return router;
}
