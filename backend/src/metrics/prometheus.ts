import client from 'prom-client';

export const metricsRegistry = new client.Registry();
client.collectDefaultMetrics({ register: metricsRegistry, prefix: 'tata_api_' });

export const rpcRequestsTotal = new client.Counter({
  name: 'tata_rpc_requests_total',
  help: 'Total JSON-RPC requests received by method and status',
  labelNames: ['method', 'status'] as const,
  registers: [metricsRegistry],
});

export const rpcRequestDurationSeconds = new client.Histogram({
  name: 'tata_rpc_duration_seconds',
  help: 'Latency of proxied JSON-RPC calls in seconds',
  labelNames: ['method'] as const,
  buckets: [0.005, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [metricsRegistry],
});

export const indexedBlockGauge = new client.Gauge({
  name: 'tata_indexer_latest_block',
  help: 'Latest execution block indexed into PostgreSQL',
  registers: [metricsRegistry],
});

export const finalizedEpochGauge = new client.Gauge({
  name: 'tata_consensus_finalized_epoch',
  help: 'Latest Beacon Chain finalized epoch',
  registers: [metricsRegistry],
});
