import { validate } from './guardrails.js';

const STEPS = [10, 25, 50];

function venueApy(snapshot, id) {
  const v = (snapshot?.venues || []).find((x) => x.id === id);
  return v ? v.apy : 0;
}

function resultingAllocation(state, from, to, pct) {
  const current = state.allocation || {};
  const next = { ...current };
  if (next[from] == null) next[from] = 0;
  if (next[to] == null) next[to] = 0;
  next[from] -= pct;
  next[to] += pct;
  return next;
}

/**
 * Enumerate candidate moves that pass guardrails, plus "hold".
 * Returns array of { id, action, from, to, amountPct, apyGain, resultingAllocation }.
 */
export function enumerateCandidates(state, config = {}) {
  const candidates = [];
  const venueEntries = Array.isArray(config.venues) ? config.venues : ['idle', 'aave-v3-usdc'];
  const venues = venueEntries.map((v) => (typeof v === 'string' ? v : v.id));
  const snapshot = state.snapshot;

  // hold is always a candidate
  candidates.push({
    id: 'hold',
    action: 'hold',
    from: 'idle',
    to: 'idle',
    amountPct: 0,
    apyGain: 0,
    resultingAllocation: { ...(state.allocation || {}) },
  });

  if (!venues || venues.length < 2) return candidates;

  let counter = 0;
  for (const from of venues) {
    for (const to of venues) {
      if (from === to) continue;
      for (const pct of STEPS) {
        const proposal = {
          action: 'move',
          from,
          to,
          amountPct: pct,
          amount_pct: pct,
          reason: '',
        };
        const verdict = validate(proposal, state, config);
        if (!verdict.ok) continue;

        const apyGain = venueApy(snapshot, to) - venueApy(snapshot, from);
        counter += 1;
        candidates.push({
          id: `c${counter}`,
          action: 'move',
          from,
          to,
          amountPct: pct,
          apyGain,
          resultingAllocation: resultingAllocation(state, from, to, pct),
        });
      }
    }
  }

  return candidates;
}

export function bestCandidate(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  // highest apy_gain; tie-break by larger amountPct then id
  return candidates.reduce((best, c) => {
    if (!best) return c;
    if (c.apyGain !== best.apyGain) return c.apyGain > best.apyGain ? c : best;
    if (c.amountPct !== best.amountPct) return c.amountPct > best.amountPct ? c : best;
    return c.id < best.id ? c : best;
  }, null);
}

export default { enumerateCandidates, bestCandidate };