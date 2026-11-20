import assert from 'node:assert/strict';
import test from 'node:test';

const RPC_URL = process.env.TATA_RPC_URL || 'http://127.0.0.1:4000/rpc';
const LIVE_ENABLED = process.env.LIVE_RPC_TEST === 'true';

async function rpcCall<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  });
  assert.equal(res.status, 200, `Expected HTTP 200 for ${method}`);
  const payload = (await res.json()) as { result?: T; error?: { message: string } };
  assert.equal(payload.error, undefined, `RPC error for ${method}: ${payload.error?.message}`);
  return payload.result as T;
}

test('Ethereum JSON-RPC Compliance Suite (Chain ID 810161)', { skip: !LIVE_ENABLED }, async () => {
  const chainId = await rpcCall<string>('eth_chainId');
  assert.equal(chainId.toLowerCase(), '0xc5c71');

  const netVersion = await rpcCall<string>('net_version');
  assert.equal(netVersion, '810161');

  const clientVer = await rpcCall<string>('web3_clientVersion');
  assert.ok(clientVer.length > 0);

  const blockNumHex = await rpcCall<string>('eth_blockNumber');
  assert.match(blockNumHex, /^0x[0-9a-fA-F]+$/);

  const genesisBlock = await rpcCall<{ number: string; hash: string }>('eth_getBlockByNumber', ['0x0', false]);
  assert.equal(genesisBlock.number, '0x0');
  assert.match(genesisBlock.hash, /^0x[0-9a-fA-F]{64}$/);

  const balance = await rpcCall<string>('eth_getBalance', ['0x7a7a000000000000000000000000000000000001', 'latest']);
  assert.match(balance, /^0x[0-9a-fA-F]+$/);

  const gasPrice = await rpcCall<string>('eth_gasPrice');
  assert.ok(BigInt(gasPrice) >= 0n);

  const estGas = await rpcCall<string>('eth_estimateGas', [
    { from: '0x7a7a000000000000000000000000000000000005', to: '0x7a7a000000000000000000000000000000000001', value: '0x1' },
  ]);
  assert.ok(BigInt(estGas) >= 21_000n);

  const callRes = await rpcCall<string>('eth_call', [
    { to: '0x000F3df6D732807Ef1319fB7B8bB8522d0Beac02', data: '0x' },
    'latest',
  ]);
  assert.ok(callRes.startsWith('0x'));

  const logs = await rpcCall<unknown[]>('eth_getLogs', [{ fromBlock: '0x0', toBlock: '0x0' }]);
  assert.ok(Array.isArray(logs));
});
