import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { env } from './config/env';
import { runMigrations } from './db/migrate';
import { pool } from './db/pool';
import { ChainIndexer } from './indexer/chainIndexer';
import { metricsRegistry } from './metrics/prometheus';
import { createRpcGatewayRouter } from './rpc/gateway';
import { createExplorerRouter } from './api/routes';
import { createAdminRouter } from './api/adminRoutes';

async function bootstrap(): Promise<void> {
  await runMigrations();

  const app = express();
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(',').map((s) => s.trim()),
      methods: ['GET', 'POST', 'OPTIONS'],
    })
  );
  app.use(express.json({ limit: '1mb' }));

  const apiLimiter = rateLimit({
    windowMs: 60_000,
    max: 240,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const indexer = new ChainIndexer();

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', chain: 'TataService Blockchain', chainId: env.CHAIN_ID });
  });

  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', metricsRegistry.contentType);
    res.end(await metricsRegistry.metrics());
  });

  app.use('/rpc', createRpcGatewayRouter());
  app.use('/api/v1', apiLimiter, createExplorerRouter());
  app.use('/api/v1/admin', createAdminRouter(indexer));

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[server] Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  const server = app.listen(env.PORT, '0.0.0.0', () => {
    console.log(`[server] TataService Explorer & RPC Gateway listening on port ${env.PORT} (Chain ID ${env.CHAIN_ID})`);
  });

  await indexer.start();

  const shutdown = async () => {
    console.log('[server] Graceful shutdown initiated...');
    indexer.stop();
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

bootstrap().catch((err) => {
  console.error('[server] Fatal startup error:', err);
  process.exit(1);
});
