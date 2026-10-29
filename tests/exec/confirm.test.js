import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { confirm } from '../../src/exec/confirm.js';

const state = {
  balances: { usdc: 100000000n, ethWei: 1000000000000000n },
  positions: { idle: 100000000n, 'aave-v3-usdc': 0n },
  allocation: { idle: 100, 'aave-v3-usdc': 0 },
  snapshot: { updatedAt: new Date().toISOString(), venues: [{ id: 'idle', apy: 0 }, { id: 'aave-v3-usdc', apy: 5 }] },
};
const proposal = { action: 'move', from: 'idle', to: 'aave-v3-usdc', amountPct: 25, reason: 'r' };

test('confirm accepts exact yes', async () => {
  const ok = await confirm(proposal, state, 0n, Readable.from(['yes\n']));
  assert.equal(ok, true);
});

test('confirm rejects anything else', async () => {
  const ok = await confirm(proposal, state, 0n, Readable.from(['y\n']));
  assert.equal(ok, false);
});