import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { Wallet } from 'ethers';
import { env } from '../backend/src/config/env';
import { createRpcGatewayRouter } from '../backend/src/rpc/gateway';
import { createAdminRouter } from '../backend/src/api/adminRoutes';
import { ChainIndexer } from '../backend/src/indexer/chainIndexer';

async function startTestServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const indexer = new ChainIndexer();
  app.use('/rpc', createRpcGatewayRouter());
  app.use('/api/v1/admin', createAdminRouter(indexer));

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('Failed to bind ephemeral port');
  }
  return {
    server,
    baseUrl: `http://127.0.0.1:${addr.port}`,
  };
}

test('Security Hardening Suite — RPC Gateway & Admin Auth', async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(() => server.close());

  await t.test('blocks privileged admin/debug/personal/miner/txpool/engine RPC methods', async () => {
    const forbidden = [
      'admin_peers',
      'debug_traceTransaction',
      'personal_listAccounts',
      'miner_start',
      'txpool_content',
      'engine_newPayloadV3',
    ];

    for (const method of forbidden) {
      const res = await fetch(`${baseUrl}/rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [] }),
      });
      assert.equal(res.status, 403, `${method} must return HTTP 403`);
      const body = (await res.json()) as { error?: { code: number } };
      assert.equal(body.error?.code, -32601);
    }
  });

  await t.test('rejects eth_sendRawTransaction signed for wrong Chain ID (e.g. Ethereum Mainnet 1)', async () => {
    const ephemeralWallet = Wallet.createRandom();
    const wrongChainRawTx = await ephemeralWallet.signTransaction({
      to: ephemeralWallet.address,
      value: 1n,
      nonce: 0,
      gasLimit: 21_000n,
      maxFeePerGas: 2_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
      chainId: 1,
    });

    const res = await fetch(`${baseUrl}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'eth_sendRawTransaction',
        params: [wrongChainRawTx],
      }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error?: { message: string } };
    assert.match(body.error?.message ?? '', /chainId/i);
  });

  await t.test('rejects malformed RLP raw transaction payloads', async () => {
    const res = await fetch(`${baseUrl}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'eth_sendRawTransaction',
        params: ['0xdeadbeef'],
      }),
    });
    assert.equal(res.status, 400);
  });

  await t.test('rejects unbounded eth_getLogs block range exceeding max limit', async () => {
    const res = await fetch(`${baseUrl}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'eth_getLogs',
        params: [{ fromBlock: '0x0', toBlock: '0x2710' }],
      }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error?: { message: string } };
    assert.match(body.error?.message ?? '', /range exceeds max/i);
  });

  await t.test('rejects unauthenticated and forged JWT requests to admin endpoints', async () => {
    const unauth = await fetch(`${baseUrl}/api/v1/admin/health`);
    assert.equal(unauth.status, 401);

    const forgedToken = jwt.sign({ sub: 'attacker', role: 'admin' }, 'wrong-secret', {
      algorithm: 'HS256',
    });
    const forged = await fetch(`${baseUrl}/api/v1/admin/health`, {
      headers: { Authorization: `Bearer ${forgedToken}` },
    });
    assert.equal(forged.status, 401);

    const nonAdminToken = jwt.sign({ sub: 'viewer', role: 'viewer' }, env.ADMIN_API_JWT_SECRET, {
      algorithm: 'HS256',
    });
    const forbiddenRole = await fetch(`${baseUrl}/api/v1/admin/health`, {
      headers: { Authorization: `Bearer ${nonAdminToken}` },
    });
    assert.equal(forbiddenRole.status, 403);
  });

  await t.test('accepts valid HS256 admin JWT on admin endpoint and validates input schema', async () => {
    const validAdminToken = jwt.sign({ sub: 'ops', role: 'admin' }, env.ADMIN_API_JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '5m',
    });
    const badBodyRes = await fetch(`${baseUrl}/api/v1/admin/reindex`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${validAdminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fromBlock: -5 }),
    });
    assert.equal(badBodyRes.status, 400);
  });
});
