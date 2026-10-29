import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockExecutor } from '../../src/exec/executor.js';

test('MockExecutor returns mock- tx hashes', async () => {
  const ex = new MockExecutor();
  const s = await ex.supply({ venue: 'aave-v3-usdc', amountUsdc: 100n });
  const w = await ex.withdraw({ venue: 'aave-v3-usdc', amountUsdc: 50n });
  assert.match(s.txHash, /^mock-/);
  assert.match(w.txHash, /^mock-/);
  assert.equal(ex.calls.length, 2);
});