import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAllocation } from '../../src/core/allocation.js';

test('computeAllocation percentages from positions', () => {
  const alloc = computeAllocation({ positions: { idle: 60n, 'aave-v3-usdc': 40n } });
  assert.equal(alloc.idle, 60);
  assert.equal(alloc['aave-v3-usdc'], 40);
});

test('computeAllocation uses balances.usdc as idle when no idle position', () => {
  const alloc = computeAllocation({ balances: { usdc: 100n }, positions: { 'aave-v3-usdc': 0n } });
  assert.equal(alloc.idle, 100);
  assert.equal(alloc['aave-v3-usdc'], 0);
});

test('computeAllocation handles zero total', () => {
  const alloc = computeAllocation({ positions: { idle: 0n, 'aave-v3-usdc': 0n } });
  assert.equal(alloc.idle, 0);
  assert.equal(alloc['aave-v3-usdc'], 0);
});