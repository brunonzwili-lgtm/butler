import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enumerateCandidates, bestCandidate } from '../../src/core/candidates.js';
import { defaultConfig } from '../../src/core/config.js';

const threeVenueConfig = {
  ...defaultConfig,
  venues: [
    { id: 'idle', type: 'idle', address: null, capPct: 80 },
    { id: 'aave-v3-usdc', type: 'aave', address: null, capPct: 80 },
    { id: 'vault-usdc', type: 'erc4626', address: '0x0000000000000000000000000000000000000000', capPct: 80 },
  ],
};

const stateIdle = {
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

test('enumerateCandidates always includes hold', () => {
  const c = enumerateCandidates(stateIdle, defaultConfig);
  assert.ok(c.some((x) => x.id === 'hold'));
});

test('idle-opportunity yields at least one move candidate', () => {
  const c = enumerateCandidates(stateIdle, defaultConfig);
  assert.ok(c.some((x) => x.action === 'move'));
});

test('already-optimal yields only hold or small moves', () => {
  const state = {
    balances: { usdc: 10000000n, ethWei: 1000000000000000n },
    positions: { idle: 10000000n, 'aave-v3-usdc': 90000000n },
    allocation: { idle: 10, 'aave-v3-usdc': 90 },
    snapshot: stateIdle.snapshot,
  };
  const c = enumerateCandidates(state, defaultConfig);
  // any move must be <= maxMovePct and not exceed caps; here cap prevents big moves
  for (const cand of c) {
    if (cand.action === 'move') assert.ok(cand.amountPct <= defaultConfig.maxMovePct);
  }
});

test('bestCandidate picks highest apy gain', () => {
  const c = enumerateCandidates(stateIdle, defaultConfig);
  const b = bestCandidate(c);
  assert.ok(b);
  assert.notEqual(b.id, 'hold'); // there is a positive gain move
});

test('three-venue enumeration includes cross-venue moves', () => {
  const state = {
    balances: { usdc: 100000000n, ethWei: 1000000000000000n },
    positions: { idle: 40000000n, 'aave-v3-usdc': 30000000n, 'vault-usdc': 30000000n },
    allocation: { idle: 40, 'aave-v3-usdc': 30, 'vault-usdc': 30 },
    snapshot: {
      updatedAt: new Date().toISOString(),
      venues: [
        { id: 'idle', name: 'Idle', apy: 0, tvlUsd: 0, riskNote: 'n' },
        { id: 'aave-v3-usdc', name: 'Aave', apy: 4.2, tvlUsd: 1000, riskNote: 'r' },
        { id: 'vault-usdc', name: 'Vault', apy: 6.0, tvlUsd: 1000, riskNote: 'r' },
      ],
    },
  };
  const c = enumerateCandidates(state, threeVenueConfig);
  assert.ok(c.some((x) => x.from === 'idle' && x.to === 'vault-usdc'));
  assert.ok(c.some((x) => x.from === 'aave-v3-usdc' && x.to === 'vault-usdc'));
});

test('cap enforcement per venue filters candidates', () => {
  const state = {
    balances: { usdc: 100000000n, ethWei: 1000000000000000n },
    positions: { idle: 100000000n, 'aave-v3-usdc': 0n, 'vault-usdc': 0n },
    allocation: { idle: 100, 'aave-v3-usdc': 0, 'vault-usdc': 0 },
    snapshot: {
      updatedAt: new Date().toISOString(),
      venues: [
        { id: 'idle', name: 'Idle', apy: 0, tvlUsd: 0, riskNote: 'n' },
        { id: 'aave-v3-usdc', name: 'Aave', apy: 4.2, tvlUsd: 1000, riskNote: 'r' },
        { id: 'vault-usdc', name: 'Vault', apy: 6.0, tvlUsd: 1000, riskNote: 'r' },
      ],
    },
  };
  const c = enumerateCandidates(state, {
    ...threeVenueConfig,
    venues: threeVenueConfig.venues.map((v) => (v.id === 'vault-usdc' ? { ...v, capPct: 10 } : v)),
  });
  // A 25% move into a 10%-capped venue must not be a candidate.
  assert.ok(!c.some((x) => x.to === 'vault-usdc' && x.amountPct === 25));
});