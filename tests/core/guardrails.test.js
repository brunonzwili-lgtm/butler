import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../../src/core/guardrails.js';
import { toProposal } from '../../src/core/actionSchema.js';
import { defaultConfig } from '../../src/core/config.js';

const now = Date.parse('2026-10-27T12:00:00Z');
const freshSnapshot = {
  updatedAt: new Date(Date.now() - 3600000).toISOString(),
  venues: [
    { id: 'idle', name: 'Idle', apy: 0, tvlUsd: 0, riskNote: 'n' },
    { id: 'aave-v3-usdc', name: 'Aave', apy: 4.2, tvlUsd: 1000, riskNote: 'r' },
  ],
};

function state(overrides = {}) {
  return {
    snapshot: freshSnapshot,
    ethBalance: 10n ** 18n,
    allocation: { idle: 100, 'aave-v3-usdc': 0 },
    ...overrides,
  };
}

function proposal(raw) {
  return toProposal(raw);
}

test('validate accepts a valid move', () => {
  const p = proposal({ action: 'move', from: 'idle', to: 'aave-v3-usdc', amount_pct: 25, reason: 'r' });
  const r = validate(p, state(), defaultConfig);
  assert.equal(r.ok, true);
  assert.deepEqual(r.violations, []);
});

test('hold always passes', () => {
  const p = proposal({ action: 'hold', from: 'idle', to: 'idle', amount_pct: 0, reason: 'r' });
  const r = validate(p, { snapshot: null, ethBalance: 0n }, defaultConfig);
  assert.equal(r.ok, true);
});

test('rejects unknown venue', () => {
  const p = proposal({ action: 'move', from: 'idle', to: 'unknown', amount_pct: 10, reason: 'r' });
  const r = validate(p, state(), defaultConfig);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => /unknown to venue/.test(v)));
});

test('rejects from === to', () => {
  const p = proposal({ action: 'move', from: 'idle', to: 'idle', amount_pct: 10, reason: 'r' });
  const r = validate(p, state(), defaultConfig);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => /must differ/.test(v)));
});

test('rejects non-positive or too-large amount_pct', () => {
  for (const amt of [0, -5, 51]) {
    const p = proposal({ action: 'move', from: 'idle', to: 'aave-v3-usdc', amount_pct: amt, reason: 'r' });
    const r = validate(p, state(), defaultConfig);
    assert.equal(r.ok, false, `amount ${amt} should fail`);
  }
});

test('rejects wrong action', () => {
  // bypass toProposal by constructing a proposal-like object with bad action
  const p = { action: 'foo', from: 'idle', to: 'aave-v3-usdc', amountPct: 10, reason: 'r' };
  const r = validate(p, state(), defaultConfig);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => /unknown action/.test(v)));
});

test('rejects venue cap exceeded', () => {
  const p = proposal({ action: 'move', from: 'idle', to: 'aave-v3-usdc', amount_pct: 50, reason: 'r' });
  const r = validate(p, state({ allocation: { idle: 60, 'aave-v3-usdc': 60 } }), defaultConfig);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => /venue cap exceeded/.test(v)));
});

test('rejects small APY gap', () => {
  const snap = JSON.parse(JSON.stringify(freshSnapshot));
  snap.venues[1].apy = 0.1;
  const p = proposal({ action: 'move', from: 'idle', to: 'aave-v3-usdc', amount_pct: 10, reason: 'r' });
  const r = validate(p, state({ snapshot: snap }), defaultConfig);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => /apy gap too small/.test(v)));
});

test('rejects stale snapshot', () => {
  const snap = JSON.parse(JSON.stringify(freshSnapshot));
  snap.updatedAt = '2026-10-20T11:00:00Z';
  const p = proposal({ action: 'move', from: 'idle', to: 'aave-v3-usdc', amount_pct: 10, reason: 'r' });
  const r = validate(p, state({ snapshot: snap }), defaultConfig);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => /stale/.test(v)));
});

test('rejects insufficient gas reserve', () => {
  const p = proposal({ action: 'move', from: 'idle', to: 'aave-v3-usdc', amount_pct: 10, reason: 'r' });
  const r = validate(p, state({ ethBalance: 0n }), defaultConfig);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => /gas reserve/.test(v)));
});

test('rejects missing snapshot', () => {
  const p = proposal({ action: 'move', from: 'idle', to: 'aave-v3-usdc', amount_pct: 10, reason: 'r' });
  const r = validate(p, { ethBalance: 10n ** 18n, allocation: { idle: 100, 'aave-v3-usdc': 0 } }, defaultConfig);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => /missing snapshot/.test(v)));
});