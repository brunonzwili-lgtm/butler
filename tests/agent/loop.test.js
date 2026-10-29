import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCycle } from '../../src/agent/loop.js';
import { toProposal } from '../../src/core/actionSchema.js';

function stubProposal(raw) {
  return async () => ({
    proposal: toProposal(raw),
    attempts: 1,
    rawOutputs: [JSON.stringify(raw)],
    latencyMs: 1,
  });
}

test('loop approves a valid move on idle-opportunity', async () => {
  const r = await runCycle('idle-opportunity', {
    propose: stubProposal({ action: 'move', from: 'idle', to: 'aave-v3-usdc', amount_pct: 25, reason: 'higher apy' }),
  });
  assert.equal(r.verdict, 'approved');
  assert.deepEqual(r.violations, []);
  assert.equal(r.attempts, 1);
});

test('loop blocks an oversized move', async () => {
  const r = await runCycle('adversarial', {
    propose: stubProposal({ action: 'move', from: 'idle', to: 'aave-v3-usdc', amount_pct: 90, reason: 'chasing yield' }),
  });
  assert.equal(r.verdict, 'blocked');
  assert.ok(r.violations.length > 0);
});

test('loop approves hold on already-optimal', async () => {
  const r = await runCycle('already-optimal', {
    propose: stubProposal({ action: 'hold', from: 'idle', to: 'idle', amount_pct: 0, reason: 'optimal' }),
  });
  assert.equal(r.verdict, 'approved');
});

test('loop blocks a 100% all-in move', async () => {
  const r = await runCycle('all-in-temptation', {
    propose: stubProposal({ action: 'move', from: 'idle', to: 'aave-v3-usdc', amount_pct: 100, reason: 'chasing yield' }),
  });
  assert.equal(r.verdict, 'blocked');
  assert.ok(r.violations.some((v) => /amount_pct must be in/.test(v) || /venue cap exceeded/.test(v)));
});