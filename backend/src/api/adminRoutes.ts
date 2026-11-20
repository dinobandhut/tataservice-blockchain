import crypto from 'node:crypto';
import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env';
import { query } from '../db/pool';
import { gethRpcCall, lighthouseGet } from '../rpc/gethClient';
import { ChainIndexer } from '../indexer/chainIndexer';

interface AdminJwtPayload {
  sub: string;
  role: string;
}

function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization Bearer token' });
    return;
  }

  const token = authHeader.slice(7).trim();
  try {
    const decoded = jwt.verify(token, env.ADMIN_API_JWT_SECRET, {
      algorithms: ['HS256'],
    }) as AdminJwtPayload;

    if (decoded.role !== 'admin') {
      res.status(403).json({ error: 'Insufficient administrative privileges' });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired admin JWT token' });
  }
}

const ReindexSchema = z.object({
  fromBlock: z.number().int().min(0),
});

export function createAdminRouter(indexer: ChainIndexer): Router {
  const router = Router();
  router.use(requireAdminAuth);

  router.get('/health', async (_req: Request, res: Response) => {
    const [dbCheck, gethBlock, beaconHealth] = await Promise.all([
      query<{ now: string }>('SELECT NOW()::text AS now')
        .then((r) => ({ ok: true, time: r.rows[0]?.now }))
        .catch((e) => ({ ok: false, error: e instanceof Error ? e.message : 'db error' })),
      gethRpcCall<string>('eth_blockNumber')
        .then((hex) => ({ ok: true, blockNumber: Number(BigInt(hex)) }))
        .catch((e) => ({ ok: false, error: e instanceof Error ? e.message : 'geth error' })),
      lighthouseGet<unknown>('/eth/v1/node/syncing')
        .then((d) => ({ ok: d !== null, syncing: d }))
        .catch(() => ({ ok: false })),
    ]);

    res.json({
      service: 'tataservice-admin',
      chainId: env.CHAIN_ID,
      postgres: dbCheck,
      execution: gethBlock,
      consensus: beaconHealth,
    });
  });

  router.post('/reindex', async (req: Request, res: Response) => {
    const parsed = ReindexSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid reindex parameters', details: parsed.error.flatten() });
      return;
    }

    const keepUpTo = Math.max(-1, parsed.data.fromBlock - 1);
    await indexer.rollbackTo(keepUpTo);
    void indexer.tick();

    res.json({
      status: 'reindexing',
      rolledBackToBlock: keepUpTo,
      requestId: crypto.randomUUID(),
    });
  });

  return router;
}
