export const ACTION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['hold', 'move'] },
    from: { type: 'string', enum: ['idle', 'aave-v3-usdc'] },
    to: { type: 'string', enum: ['idle', 'aave-v3-usdc'] },
    amount_pct: { type: 'number' },
    reason: { type: 'string' },
  },
  required: ['action', 'from', 'to', 'amount_pct', 'reason'],
  additionalProperties: false,
};

/**
 * Convert raw model output into a typed Proposal.
 * Throws on malformed input.
 */
export function toProposal(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('proposal must be an object');
  }
  const { action, from, to, amount_pct, reason } = raw;

  if (action !== 'hold' && action !== 'move') {
    throw new Error(`invalid action: ${String(action)}`);
  }
  if (typeof from !== 'string' || from.length === 0) {
    throw new Error('from must be a non-empty string');
  }
  if (typeof to !== 'string' || to.length === 0) {
    throw new Error('to must be a non-empty string');
  }
  if (typeof amount_pct !== 'number' || !Number.isFinite(amount_pct)) {
    throw new Error('amount_pct must be a finite number');
  }
  if (typeof reason !== 'string') {
    throw new Error('reason must be a string');
  }

  return {
    action,
    from,
    to,
    amountPct: amount_pct,
    reason,
    raw,
  };
}

export function parseProposal(raw) {
  return toProposal(raw);
}

export function isProposal(value) {
  try {
    toProposal(value);
    return true;
  } catch {
    return false;
  }
}

export default { ACTION_JSON_SCHEMA, toProposal, parseProposal, isProposal };