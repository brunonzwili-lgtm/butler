import { computeAllocation } from './allocation.js';
import { validateSnapshot } from './snapshot.js';

function toBigInt(value) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  if (typeof value === 'string') return BigInt(value);
  if (value == null) return 0n;
  throw new TypeError('value must be bigint, number, or string');
}

export function validate(proposal, state = {}, config = {}) {
  const cfg = { ...config };
  if (!cfg.venues) cfg.venues = ['idle', 'aave-v3-usdc'];
  if (cfg.maxMovePct == null) cfg.maxMovePct = 50;
  if (cfg.venueCapPct == null) cfg.venueCapPct = 80;
  if (cfg.minApyGap == null) cfg.minApyGap = 1.0;
  if (cfg.ethGasReserveWei == null) cfg.ethGasReserveWei = 0n;
  if (cfg.maxAgeHours == null) cfg.maxAgeHours = 24;

  const violations = [];

  if (!proposal || typeof proposal !== 'object') {
    return { ok: false, violations: ['proposal is required'] };
  }

  // "hold" always passes.
  if (proposal.action === 'hold') {
    return { ok: true, violations: [] };
  }

  if (proposal.action !== 'move') {
    violations.push(`unknown action: ${String(proposal.action)}`);
  }

  const venueEntries = Array.isArray(cfg.venues) ? cfg.venues : [];
  const knownVenues = venueEntries.map((v) => (typeof v === 'string' ? v : v.id));
  if (!knownVenues.includes(proposal.from)) {
    violations.push(`unknown from venue: ${String(proposal.from)}`);
  }
  if (!knownVenues.includes(proposal.to)) {
    violations.push(`unknown to venue: ${String(proposal.to)}`);
  }
  if (proposal.from === proposal.to) {
    violations.push('from and to must differ');
  }

  const amountPct = proposal.amountPct ?? proposal.amount_pct;
  if (typeof amountPct !== 'number' || !Number.isFinite(amountPct) || amountPct <= 0 || amountPct > cfg.maxMovePct) {
    violations.push(`amount_pct must be in (0, ${cfg.maxMovePct}]`);
  }

  // Snapshot freshness + APY gap.
  const snapshot = state.snapshot;
  if (!snapshot) {
    violations.push('missing snapshot');
  } else {
    const snap = validateSnapshot(snapshot, cfg);
    if (!snap.ok) {
      for (const e of snap.errors) violations.push(e);
    } else {
      const fromVenue = (snapshot.venues || []).find((v) => v.id === proposal.from);
      const toVenue = (snapshot.venues || []).find((v) => v.id === proposal.to);
      if (fromVenue && toVenue && (toVenue.apy - fromVenue.apy) < cfg.minApyGap) {
        violations.push(`apy gap too small: ${(toVenue.apy - fromVenue.apy).toFixed(2)} < ${cfg.minApyGap}`);
      }
    }
  }

  // Gas reserve for ETH.
  try {
    const eth = state.balances?.ethWei ?? state.balances?.eth ?? state.ethBalance ?? state.eth_balance ?? 0n;
    if (toBigInt(eth) < toBigInt(cfg.ethGasReserveWei)) {
      violations.push('eth gas reserve not met');
    }
  } catch {
    violations.push('invalid eth balance');
  }

  // Resulting allocation cap.
  if (Number.isFinite(amountPct) && amountPct > 0) {
    const current = state.allocation || computeAllocation(state);
    const resulting = { ...current };
    if (resulting[proposal.from] == null) resulting[proposal.from] = 0;
    if (resulting[proposal.to] == null) resulting[proposal.to] = 0;
    resulting[proposal.from] -= amountPct;
    resulting[proposal.to] += amountPct;

    for (const [id, pct] of Object.entries(resulting)) {
      if (pct < 0) violations.push(`resulting allocation negative: ${id}`);
      const cap = (venueEntries.find((v) => (typeof v === 'string' ? v : v.id) === id) || {}).capPct ?? cfg.venueCapPct;
      if (pct > cap) violations.push(`venue cap exceeded: ${id} ${pct}% > ${cap}%`);
    }
  }

  return { ok: violations.length === 0, violations };
}

export default { validate };