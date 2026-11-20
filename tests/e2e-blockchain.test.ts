import assert from 'node:assert/strict';
import test from 'node:test';
import { JsonRpcProvider, Wallet, parseEther } from 'ethers';

const RPC_URL = process.env.TATA_RPC_URL || 'http://127.0.0.1:4000/rpc';
const API_URL = process.env.TATA_API_URL || 'http://127.0.0.1:4000/api/v1';
const FUNDED_KEY = process.env.TEST_FUNDER_PRIVATE_KEY || '';
const LIVE_E2E = process.env.LIVE_E2E_TEST === 'true' && FUNDED_KEY.length > 0;

test('End-to-End Signed Transaction, Receipt & Explorer Indexing', { skip: !LIVE_E2E }, async () => {
  const provider = new JsonRpcProvider(RPC_URL, 810161);
  const sender = new Wallet(FUNDED_KEY, provider);
  const recipient = Wallet.createRandom();

  const txResponse = await sender.sendTransaction({
    to: recipient.address,
    value: parseEther('0.01'),
  });

  const receipt = await txResponse.wait(1);
  assert.ok(receipt, 'Transaction receipt must be returned');
  assert.equal(receipt.status, 1);

  const recipientBalance = await provider.getBalance(recipient.address);
  assert.equal(recipientBalance, parseEther('0.01'));

  // Poll Explorer API until indexer ingests the transaction
  let indexed = false;
  for (let i = 0; i < 15; i++) {
    const res = await fetch(`${API_URL}/transactions/${txResponse.hash}`);
    if (res.status === 200) {
      indexed = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  assert.equal(indexed, true, 'Transaction must be indexed into PostgreSQL Explorer API');
});
