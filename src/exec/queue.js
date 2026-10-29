import crypto from 'node:crypto';
import { appendFileSync, readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const QUEUE_PATH = join(process.cwd(), 'data', 'queue.jsonl');

function ensureDataDir() {
  mkdirSync(join(process.cwd(), 'data'), { recursive: true });
}

export function hashProposal(proposal) {
  return crypto.createHash('sha256').update(JSON.stringify(proposal)).digest('hex');
}

export function enqueue(proposal, meta = {}) {
  ensureDataDir();
  const intent = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    proposal,
    proposalHash: hashProposal(proposal),
    approvedAt: meta.approvedAt || new Date().toISOString(),
    status: 'queued',
    ...meta,
  };
  const serialized = JSON.stringify(intent, (k, v) => (typeof v === 'bigint' ? v.toString() : v));
  appendFileSync(QUEUE_PATH, serialized + '\n', 'utf8');
  return intent;
}

export function pending() {
  return listAll().filter((i) => i.status === 'queued');
}

export function listAll() {
  if (!existsSync(QUEUE_PATH)) return [];
  return readFileSync(QUEUE_PATH, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

export function markStatus(id, status, extra = {}) {
  ensureDataDir();
  const items = listAll();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) throw new Error(`intent not found: ${id}`);
  items[idx] = { ...items[idx], status, updatedAt: new Date().toISOString(), ...extra };
  const body = items
    .map((i) => JSON.stringify(i, (k, v) => (typeof v === 'bigint' ? v.toString() : v)))
    .join('\n');
  writeFileSync(QUEUE_PATH, body + (body ? '\n' : ''), 'utf8');
  return items[idx];
}

export default { enqueue, pending, listAll, markStatus, hashProposal };