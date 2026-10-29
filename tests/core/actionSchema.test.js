import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toProposal, isProposal, ACTION_JSON_SCHEMA } from '../../src/core/actionSchema.js';

test('toProposal converts valid raw action', () => {
  const p = toProposal({ action: 'move', from: 'idle', to: 'aave-v3-usdc', amount_pct: 25, reason: 'higher apy' });
  assert.equal(p.action, 'move');
  assert.equal(p.amountPct, 25);
  assert.equal(p.from, 'idle');
});

test('toProposal rejects malformed model output', () => {
  assert.throws(() => toProposal(null));
  assert.throws(() => toProposal({ action: 'foo', from: 'idle', to: 'aave-v3-usdc', amount_pct: 10, reason: 'x' }));
  assert.throws(() => toProposal({ action: 'hold', from: '', to: 'aave-v3-usdc', amount_pct: 10, reason: 'x' }));
  assert.throws(() => toProposal({ action: 'hold', from: 'idle', to: 'aave-v3-usdc', amount_pct: '10', reason: 'x' }));
});

test('isProposal works', () => {
  assert.equal(isProposal({ action: 'hold', from: 'idle', to: 'idle', amount_pct: 0, reason: 'r' }), true);
  assert.equal(isProposal({ action: 'nope' }), false);
});

test('schema has required fields', () => {
  assert.ok(ACTION_JSON_SCHEMA.required.includes('amount_pct'));
});