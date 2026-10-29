import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapChoice, fallbackProposal } from '../../src/agent/model.js';
import { enumerateCandidates } from '../../src/core/candidates.js';
import { defaultConfig } from '../../src/core/config.js';

const state = {
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

test('mapChoice maps valid id', () => {
  const cands = enumerateCandidates(state, defaultConfig);
  const p = mapChoice(cands.find((c) => c.action === 'move').id, 'because', cands);
  assert.equal(p.action, 'move');
});

test('mapChoice throws on invalid id', () => {
  const cands = enumerateCandidates(state, defaultConfig);
  assert.throws(() => mapChoice('nope', 'r', cands));
});

test('fallbackProposal returns hold when no move candidates', () => {
  const cands = [{ id: 'hold', action: 'hold', from: 'idle', to: 'idle', amountPct: 0, apyGain: 0, resultingAllocation: { idle: 100 } }];
  const p = fallbackProposal(cands);
  assert.equal(p.action, 'hold');
  assert.equal(p.reason, 'fallback_ranked');
});

test('empty... candidate list handled by fallback', () => {
  const p = fallbackProposal([]);
  assert.equal(p.action, 'hold');
});