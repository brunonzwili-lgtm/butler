import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enqueue, pending, listAll } from '../../src/exec/queue.js';
import { MockExecutor } from '../../src/exec/executor.js';
import { flush } from '../../src/exec/flush.js';
import { writeFileSync, mkdirSync } from 'node:fs';

function resetQueue() {
  mkdirSync('data', { recursive: true });
  writeFileSync('data/queue.jsonl', '', 'utf8');
}

const validState = {
  balances: { usdc: 100000000n, ethWei: 1000000000000000n },
  positions: { idle: 100000000n, 'aave-v3-usdc': 0n },
  allocation: { idle: 100, 'aave-v3-usdc': 0 },
  snapshot: {
    updatedAt: new Date().toISOString(),
    venues: [
      { id: 'idle', name: 'Idle', apy: 0, tvlUsd: 0, riskNote: 'n' },
      { id: 'aave-v3-usdc', name: 'Aave', apy: 5, tvlUsd: 1000, riskNote: 'r' },
    ],
  },
};

const blockedState = {
  balances: { usdc: 30000000n, ethWei: 1000000000000000n },
  positions: { idle: 30000000n, 'aave-v3-usdc': 70000000n },
  allocation: { idle: 30, 'aave-v3-usdc': 70 },
  snapshot: {
    updatedAt: new Date().toISOString(),
    venues: [
      { id: 'idle', name: 'Idle', apy: 0, tvlUsd: 0, riskNote: 'n' },
      { id: 'aave-v3-usdc', name: 'Aave', apy: 5, tvlUsd: 1000, riskNote: 'r' },
    ],
  },
};

test('flush executes approved intent when state still valid', async () => {
  resetQueue();
  const proposal = { action: 'move', from: 'idle', to: 'aave-v3-usdc', amount_pct: 25, reason: 'r' };
  enqueue(proposal, { amountUsdc: '25000000' });
  const ex = new MockExecutor();
  const results = await flush(ex, async () => validState);
  assert.equal(results[0].status, 'executed');
  assert.match(results[0].txHash, /^mock-/);
});

test('flush rejects when state changed', async () => {
  resetQueue();
  const proposal = { action: 'move', from: 'idle', to: 'aave-v3-usdc', amount_pct: 25, reason: 'r' };
  enqueue(proposal, { amountUsdc: '25000000' });
  const ex = new MockExecutor();
  const results = await flush(ex, async () => blockedState);
  assert.equal(results[0].status, 'rejected_on_replay');
  assert.ok(results[0].violations.length > 0);
});

test('flush leaves queued when offline', async () => {
  resetQueue();
  const proposal = { action: 'move', from: 'idle', to: 'aave-v3-usdc', amount_pct: 25, reason: 'r' };
  enqueue(proposal, { amountUsdc: '25000000' });
  const ex = new MockExecutor();
  ex.isOnline = async () => false;
  const results = await flush(ex, async () => validState);
  assert.equal(results[0].status, 'queued');
  assert.equal(pending().length, 1);
});

test('flush does nothing without approved intents', async () => {
  resetQueue();
  const ex = new MockExecutor();
  const results = await flush(ex, async () => validState);
  assert.deepEqual(results, []);
  assert.equal(ex.calls.length, 0);
});

test('flush rejects hash mismatch', async () => {
  resetQueue();
  const proposal = { action: 'move', from: 'idle', to: 'aave-v3-usdc', amount_pct: 25, reason: 'r' };
  const intent = enqueue(proposal, { amountUsdc: '25000000' });
  // tamper stored proposal by rewriting queue file
  const { writeFileSync } = await import('node:fs');
  const tampered = { ...intent, proposal: { ...proposal, amount_pct: 99 } };
  writeFileSync('data/queue.jsonl', JSON.stringify(tampered) + '\n', 'utf8');
  const ex = new MockExecutor();
  const results = await flush(ex, async () => validState);
  assert.equal(results[0].status, 'rejected_on_replay');
  assert.equal(results[0].reason, 'hash_mismatch');
});

test('flush skips executing intents', async () => {
  resetQueue();
  const proposal = { action: 'move', from: 'idle', to: 'aave-v3-usdc', amount_pct: 25, reason: 'r' };
  const intent = enqueue(proposal, { amountUsdc: '25000000' });
  const { markStatus } = await import('../../src/exec/queue.js');
  markStatus(intent.id, 'executing');
  const ex = new MockExecutor();
  const results = await flush(ex, async () => validState);
  assert.equal(results[0].status, 'executing');
  assert.equal(results[0].reason, 'already_executing');
  assert.equal(ex.calls.length, 0);
});

test('flush uses min(original, fresh) amount', async () => {
  resetQueue();
  const proposal = { action: 'move', from: 'idle', to: 'aave-v3-usdc', amount_pct: 20, reason: 'r' };
  enqueue(proposal, { amountUsdc: '25000000' }); // original 25 USDC
  const ex = new MockExecutor();
  const results = await flush(ex, async () => validState); // fresh 20 USDC
  assert.equal(results[0].status, 'executed');
  assert.ok(BigInt(ex.calls[0].amountUsdc) <= 20000000n);
});