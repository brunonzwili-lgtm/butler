import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enqueue, pending, markStatus, listAll } from '../../src/exec/queue.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

function resetQueue() {
  mkdirSync('data', { recursive: true });
  writeFileSync('data/queue.jsonl', '', 'utf8');
}

test('enqueue creates queued intent with hash', () => {
  resetQueue();
  const intent = enqueue({ action: 'move', from: 'idle', to: 'aave-v3-usdc', amount_pct: 25, reason: 'r' });
  assert.equal(intent.status, 'queued');
  assert.ok(intent.id);
  assert.ok(intent.proposalHash);
  assert.equal(pending().length, 1);
});

test('markStatus updates intent', () => {
  resetQueue();
  const intent = enqueue({ action: 'hold', from: 'idle', to: 'idle', amount_pct: 0, reason: 'r' });
  const updated = markStatus(intent.id, 'executed', { txHash: 'mock-123' });
  assert.equal(updated.status, 'executed');
  assert.equal(updated.txHash, 'mock-123');
  assert.equal(pending().length, 0);
});