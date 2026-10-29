import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSnapshot, snapshotAgeHours, loadSnapshot } from '../../src/core/snapshot.js';

const now = Date.parse('2026-10-27T12:00:00Z');

const good = {
  updatedAt: '2026-10-27T10:00:00Z',
  venues: [
    { id: 'idle', name: 'Idle wallet', apy: 0, tvlUsd: 0, riskNote: 'none' },
    { id: 'aave-v3-usdc', name: 'Aave V3 USDC', apy: 4.2, tvlUsd: 1000, riskNote: 'risk' },
  ],
};

test('validateSnapshot accepts a fresh valid snapshot', () => {
  const r = validateSnapshot(good, { maxAgeHours: 24 }, now);
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
});

test('validateSnapshot rejects stale snapshot', () => {
  const stale = { ...good, updatedAt: '2026-10-20T10:00:00Z' };
  const r = validateSnapshot(stale, { maxAgeHours: 24 }, now);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /stale/.test(e)));
});

test('validateSnapshot requires idle and aave venues', () => {
  const s = { ...good, venues: [good.venues[1]] };
  const r = validateSnapshot(s, { maxAgeHours: 24 }, now);
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('missing venue: idle'));
});

test('validateSnapshot requires idle apy 0', () => {
  const s = JSON.parse(JSON.stringify(good));
  s.venues[0].apy = 1;
  const r = validateSnapshot(s, { maxAgeHours: 24 }, now);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /idle venue apy/.test(e)));
});

test('snapshotAgeHours computes age', () => {
  const h = snapshotAgeHours(good, now);
  assert.ok(h >= 1.99 && h <= 2.01);
});

test('loadSnapshot reads data/yields.json', () => {
  const s = loadSnapshot('data/yields.json', { maxAgeHours: 24 * 365 });
  assert.equal(validateSnapshot(s, { maxAgeHours: 24 * 365 }).ok, true);
});