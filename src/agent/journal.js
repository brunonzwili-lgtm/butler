import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const JOURNAL_PATH = join(process.cwd(), 'data', 'journal.jsonl');

export function appendJournal(entry) {
  try {
    mkdirSync(join(process.cwd(), 'data'), { recursive: true });
  } catch {}

  const state = entry.state || {};
  const record = {
    timestamp: new Date().toISOString(),
    source: entry.source ?? null,
    state: {
      balances: state.balances ?? null,
      allocation: state.allocation ?? null,
      snapshot: state.snapshot
        ? {
            updatedAt: state.snapshot.updatedAt,
            venues: (state.snapshot.venues || []).map((v) => ({ id: v.id, apy: v.apy })),
          }
        : null,
    },
    proposal: entry.proposal ?? null,
    verdict: entry.verdict ?? null,
    violations: entry.violations ?? [],
    attempts: entry.attempts ?? null,
    rawOutputs: entry.rawOutputs ?? [],
    latencyMs: entry.latencyMs ?? null,
  };

  appendFileSync(JOURNAL_PATH, JSON.stringify(record, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  ) + '\n', 'utf8');
}

export default { appendJournal };