function toBigInt(value) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  if (typeof value === 'string') return BigInt(value);
  if (value == null) return 0n;
  throw new TypeError('amount must be bigint, number, or string');
}

/**
 * Compute the current allocation as a percentage per venue.
 *
 * Accepts either:
 *   { positions: { [venueId]: amount } }
 * or
 *   { balances: { usdc: amount }, positions: { [venueId]: amount } }
 *
 * Wallet USDC (balances.usdc) is treated as the "idle" venue when no
 * explicit idle position is given.
 */
export function computeAllocation(state = {}) {
  const positions = { ...(state.positions || {}) };

  if (state.balances && state.balances.usdc != null && positions.idle == null) {
    positions.idle = state.balances.usdc;
  }

  const ids = Object.keys(positions);
  const amounts = Object.fromEntries(ids.map((id) => [id, toBigInt(positions[id])]));

  const total = ids.reduce((sum, id) => sum + amounts[id], 0n);

  const result = {};
  for (const id of ids) {
    if (total > 0n) {
      result[id] = Number((amounts[id] * 10000n) / total) / 100;
    } else {
      result[id] = 0;
    }
  }
  return result;
}

export function allocation(state) {
  return computeAllocation(state);
}

export default { computeAllocation, allocation };