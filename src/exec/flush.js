import { validate } from '../core/guardrails.js';
import { defaultConfig } from '../core/config.js';
import { pending, listAll, markStatus, hashProposal } from './queue.js';

function totalUsdc(state) {
  const idle = state.balances?.usdc ?? 0n;
  const aave = state.positions?.['aave-v3-usdc'] ?? 0n;
  return BigInt(idle) + BigInt(aave);
}

function amountFromProposal(state, proposal) {
  const total = totalUsdc(state);
  const pct = (proposal && (proposal.amountPct ?? proposal.amount_pct)) ?? 0;
  const bp = BigInt(Math.round(pct * 100));
  return (total * bp) / 10000n;
}

function pctFromAmount(state, amount) {
  const total = totalUsdc(state);
  if (total === 0n) return 0;
  return Number((amount * 10000n) / total) / 100;
}

export async function flush(executor, observeFn, config = defaultConfig) {
  const results = [];
  const intents = listAll().filter((i) => i.status === 'queued' || i.status === 'executing');

  for (const intent of intents) {
    // Never retry an intent stuck in "executing" without manual check.
    if (intent.status === 'executing') {
      results.push({ id: intent.id, status: 'executing', reason: 'already_executing' });
      continue;
    }

    // Connectivity check.
    let online = true;
    if (typeof executor.isOnline === 'function') {
      online = await executor.isOnline();
    }
    if (!online) {
      results.push({ id: intent.id, status: 'queued', reason: 'offline' });
      continue;
    }

    // Replay integrity: recompute proposalHash.
    const computed = hashProposal(intent.proposal);
    if (computed !== intent.proposalHash) {
      markStatus(intent.id, 'rejected_on_replay', { reason: 'hash_mismatch', violations: ['hash_mismatch'] });
      results.push({ id: intent.id, status: 'rejected_on_replay', reason: 'hash_mismatch', violations: ['hash_mismatch'] });
      continue;
    }

    let state;
    try {
      state = await observeFn();
    } catch (err) {
      markStatus(intent.id, 'failed', { error: `observe failed: ${err.message}` });
      results.push({ id: intent.id, status: 'failed', error: err.message });
      continue;
    }

    // Determine execution amount: min(original, pct of fresh balance).
    const originalAmount = intent.amountUsdc != null ? BigInt(intent.amountUsdc) : amountFromProposal(state, intent.proposal);
    const freshAmount = amountFromProposal(state, intent.proposal);
    const execAmount = originalAmount < freshAmount ? originalAmount : freshAmount;

    // Re-run guardrails on the resulting amount.
    const execPct = pctFromAmount(state, execAmount);
    const replayProposal = { ...intent.proposal, amountPct: execPct, amount_pct: execPct };

    const verdict = validate(replayProposal, state, config);
    if (!verdict.ok) {
      markStatus(intent.id, 'rejected_on_replay', { violations: verdict.violations });
      results.push({ id: intent.id, status: 'rejected_on_replay', violations: verdict.violations });
      continue;
    }

    // Mark executing before broadcast.
    markStatus(intent.id, 'executing', { execAmount: execAmount.toString() });

    const isSupply = intent.proposal.from === 'idle' && intent.proposal.to === 'aave-v3-usdc';
    const isWithdraw = intent.proposal.from === 'aave-v3-usdc' && intent.proposal.to === 'idle';

    try {
      let res;
      if (isSupply) res = await executor.supply({ venue: intent.proposal.to, amountUsdc: execAmount });
      else if (isWithdraw) res = await executor.withdraw({ venue: intent.proposal.from, amountUsdc: execAmount });
      else throw new Error('unsupported route');

      markStatus(intent.id, 'executed', { txHash: res?.txHash ?? res?.hash ?? null });
      results.push({ id: intent.id, status: 'executed', txHash: res?.txHash ?? res?.hash ?? null });
    } catch (err) {
      markStatus(intent.id, 'failed', { error: err.message });
      results.push({ id: intent.id, status: 'failed', error: err.message });
    }
  }

  return results;
}

export default { flush };