import { test } from 'node:test';
import assert from 'node:assert/strict';
import { watchFunds } from '../../src/deposit/watch.js';

test('watchFunds returns when funds arrive after N polls', async () => {
  let n = 0;
  const read = async () => {
    n++;
    if (n < 3) return { usdc: 0n, eth: 0n };
    return { usdc: 5n, eth: 1n };
  };
  const r = await watchFunds({ readBalances: read, intervalMs: 0, timeoutMs: 5000 });
  assert.equal(r.usdc, 5n);
  assert.equal(r.eth, 1n);
});

test('watchFunds times out', async () => {
  const read = async () => ({ usdc: 0n, eth: 0n });
  await assert.rejects(() => watchFunds({ readBalances: read, intervalMs: 0, timeoutMs: 1 }), /timeout/);
});