import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CHAIN_ID: z.coerce.number().int().default(810161),
  TOTAL_SUPPLY_TATA: z.string().default('1000000000'),
  GETH_HTTP_RPC_URL: z.string().url().default('http://127.0.0.1:8545'),
  GETH_WS_RPC_URL: z.string().default('ws://127.0.0.1:8546'),
  LIGHTHOUSE_BEACON_API_URL: z.string().url().default('http://127.0.0.1:5052'),
  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgresql://tata_indexer:CHANGE_ME_STRONG_DB_PASSWORD@127.0.0.1:5432/tata_explorer'),
  ADMIN_API_JWT_SECRET: z.string().min(16).default('dev_insecure_change_in_production_min_32_chars'),
  CORS_ORIGIN: z.string().default('*'),
  RPC_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
  RPC_RATE_LIMIT_MAX: z.coerce.number().int().min(10).default(300),
  RPC_MAX_LOG_RANGE: z.coerce.number().int().min(10).max(10_000).default(2000),
  INDEXER_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v.toLowerCase() === 'true'),
  INDEXER_POLL_MS: z.coerce.number().int().min(500).default(3000),
});

export type AppEnv = z.infer<typeof EnvSchema>;
export const env: AppEnv = EnvSchema.parse(process.env);
