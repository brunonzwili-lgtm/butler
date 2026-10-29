#!/usr/bin/env node
import { runCycle } from '../agent/loop.js';
import { createExecutor } from './executor.js';
import { confirm } from './confirm.js';
import { enqueue } from './queue.js';
import { defaultConfig } from '../core/config.js';
import { ensureModel, getLoadTimeMs } from '../agent/model.js';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--source') args.source = argv[++i];
    else if (argv[i] === '--executor') args.executor = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log('Usage: npm run run -- --source <name|live> --executor mock|aave');
  process.exit(0);
}

const source = args.source || 'idle-opportunity';
const executorKind = args.executor || 'mock';

console.log('warming up model...');
const warmStart = Date.now();
await ensureModel();
console.log(`model loaded in ${Date.now() - warmStart} ms (loadTimeMs=${getLoadTimeMs()})`);

console.log('model thinking...');
const result = await runCycle(source);

console.log('\n=== Butler cycle ===');
console.log('source:', result.source);
console.log('balances:', result.state.balances);
console.log('allocation:', result.state.allocation);
console.log('proposal:', JSON.stringify(result.proposal));
console.log('verdict:', result.verdict.toUpperCase());
if (result.violations && result.violations.length) {
  console.log('violations:');
  for (const v of result.violations) console.log('  -', v);
}
console.log('attempts:', result.attempts, 'latencyMs:', result.latencyMs, 'loadMs:', result.loadTimeMs, 'inferenceMs:', result.inferenceTimeMs);

if (result.verdict !== 'approved') {
  console.log('\nBlocked by guardrails; no execution.');
  process.exit(0);
}

const est = await (async () => {
  let ex;
  if (executorKind === 'router' || executorKind === 'live') { const { createRouter } = await import('./router.js'); ex = createRouter({}); } else { ex = createExecutor(executorKind); }
  return ex.estimate();
})();
const approved = await confirm(result.proposal, result.state, est.fee ?? 0n);

if (!approved) {
  console.log('\nCancelled by user; nothing executed.');
  process.exit(0);
}

// execute or queue
let executor;
if (executorKind === 'router' || executorKind === 'live') {
  const { createRouter } = await import('./router.js');
  executor = createRouter({});
} else {
  executor = createExecutor(executorKind);
}
const online = typeof executor.isOnline === 'function' ? await executor.isOnline() : true;

function totalUsdc(state) {
  const idle = state.balances?.usdc ?? 0n;
  const aave = state.positions?.['aave-v3-usdc'] ?? 0n;
  return BigInt(idle) + BigInt(aave);
}
function amountFromPct(state, pct) {
  const total = totalUsdc(state);
  const bp = BigInt(Math.round((pct ?? 0) * 100));
  return (total * bp) / 10000n;
}

const amount = amountFromPct(result.state, result.proposal.amountPct ?? result.proposal.amount_pct ?? 0);
const isSupply = result.proposal.from === 'idle' && result.proposal.to === 'aave-v3-usdc';
const isWithdraw = result.proposal.from === 'aave-v3-usdc' && result.proposal.to === 'idle';

if (!online) {
  const signed = isSupply
    ? await executor.signSupply(amount)
    : await executor.signWithdraw(amount);
  const intent = enqueue(result.proposal, { approvedAt: new Date().toISOString(), signedTx: signed, amountUsdc: amount.toString() });
  console.log('\nOffline: approved intent queued.');
  console.log('intent id:', intent.id);
  console.log('signedTx:', signed);
  process.exit(0);
}

try {
  let res;
  if (isSupply) res = await executor.supply({ venue: 'aave-v3-usdc', amountUsdc: amount });
  else if (isWithdraw) res = await executor.withdraw({ venue: 'aave-v3-usdc', amountUsdc: amount });
  else throw new Error('unsupported route');
  console.log('\nExecuted.');
  console.log('txHash:', res?.txHash ?? res?.hash ?? JSON.stringify(res));
} catch (err) {
  console.error('\nExecution failed:', err && err.message ? err.message : err);
  process.exit(1);
}
process.exit(0);