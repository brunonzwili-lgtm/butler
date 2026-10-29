import readline from 'node:readline';
import { appendJournal } from '../agent/journal.js';

function amountUsd(proposal, state) {
  const total = (state.balances?.usdc ?? 0n) + (state.positions?.['aave-v3-usdc'] ?? 0n);
  const totalNum = Number(total) / 1e6;
  const pct = proposal.amountPct ?? proposal.amount_pct ?? 0;
  return (totalNum * pct) / 100;
}

function resultingAllocation(state, proposal) {
  const current = state.allocation || {};
  const pct = proposal.amountPct ?? proposal.amount_pct ?? 0;
  const next = { ...current };
  if (next[proposal.from] == null) next[proposal.from] = 0;
  if (next[proposal.to] == null) next[proposal.to] = 0;
  next[proposal.from] -= pct;
  next[proposal.to] += pct;
  return next;
}

export async function confirm(proposal, state, estimatedFee = 0n, input = process.stdin, output = process.stdout) {
  const pct = proposal.amountPct ?? proposal.amount_pct ?? 0;
  const usd = amountUsd(proposal, state);
  const from = proposal.from;
  const to = proposal.to;
  const current = state.allocation || {};
  const next = resultingAllocation(state, proposal);

  console.log('\n--- Confirmation ---');
  console.log(`Proposal: move ${pct}% (≈ $${usd.toFixed(2)} USDC) from ${from} to ${to}`);
  console.log(`Reason: ${proposal.reason}`);
  console.log('Current allocation:', JSON.stringify(current));
  console.log('Resulting allocation:', JSON.stringify(next));
  console.log(`Estimated fee: ${estimatedFee} wei (note: Aave supply requires approve + supply = 2 transactions/fees)`);
  console.log('Type "yes" exactly to execute, anything else cancels.');

  const rl = readline.createInterface({ input, output });
  const answer = await new Promise((resolve) => {
    rl.question('> ', (a) => {
      rl.close();
      resolve(String(a).trim());
    });
  });

  const approved = answer === 'yes';
  try {
    appendJournal({
      source: state.source ?? null,
      state,
      proposal,
      verdict: approved ? 'approved_by_user' : 'declined_by_user',
      violations: [],
      attempts: null,
      rawOutputs: [],
      latencyMs: null,
    });
  } catch {}
  return approved;
}

export default { confirm };