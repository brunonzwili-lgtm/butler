import { readFileSync } from 'node:fs';

function isFiniteNumber(x) {
  return typeof x === 'number' && Number.isFinite(x);
}

function parseUpdatedAt(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : NaN;
  }
  return NaN;
}

export function snapshotAgeHours(snapshot, now = Date.now()) {
  return (now - parseUpdatedAt(snapshot?.updatedAt)) / 3_600_000;
}

export function validateSnapshot(snapshot, config = {}, now = Date.now()) {
  const errors = [];
  const maxAgeHours = config.maxAgeHours ?? 24;

  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return { ok: false, errors: ['snapshot must be an object'] };
  }

  if (!Array.isArray(snapshot.venues)) {
    errors.push('venues must be an array');
  }

  const venues = Array.isArray(snapshot.venues) ? snapshot.venues : [];
  const ids = venues.map((v) => (v && typeof v === 'object' ? v.id : undefined));

  if (!ids.includes('idle')) errors.push('missing venue: idle');
  if (!ids.includes('aave-v3-usdc')) errors.push('missing venue: aave-v3-usdc');

  for (const v of venues) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) {
      errors.push('venue must be an object');
      continue;
    }
    if (typeof v.id !== 'string' || v.id.length === 0) errors.push('venue.id must be a non-empty string');
    if (typeof v.name !== 'string' || v.name.length === 0) errors.push(`venue ${v.id ?? '?'}: name must be a non-empty string`);
    if (!isFiniteNumber(v.apy)) errors.push(`venue ${v.id ?? '?'}: apy must be a finite number`);
    if (!isFiniteNumber(v.tvlUsd)) errors.push(`venue ${v.id ?? '?'}: tvlUsd must be a finite number`);
    if (typeof v.riskNote !== 'string') errors.push(`venue ${v.id ?? '?'}: riskNote must be a string`);
  }

  const idle = venues.find((v) => v && v.id === 'idle');
  if (idle && isFiniteNumber(idle.apy) && idle.apy !== 0) {
    errors.push('idle venue apy must be 0');
  }

  const age = snapshotAgeHours(snapshot, now);
  if (!Number.isFinite(age)) {
    errors.push('updatedAt must be a valid timestamp or date string');
  } else if (age > maxAgeHours) {
    errors.push(`snapshot is stale: ${age.toFixed(2)}h > ${maxAgeHours}h`);
  } else if (age < 0) {
    errors.push('updatedAt is in the future');
  }

  return { ok: errors.length === 0, errors };
}

export function loadSnapshot(filePath, config = {}, now = Date.now()) {
  let raw;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new Error(`cannot read snapshot ${filePath}: ${err.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`invalid JSON in snapshot ${filePath}: ${err.message}`);
  }
  const result = validateSnapshot(parsed, config, now);
  if (!result.ok) {
    throw new Error(`invalid snapshot ${filePath}: ${result.errors.join('; ')}`);
  }
  return parsed;
}

export default { validateSnapshot, loadSnapshot, snapshotAgeHours };