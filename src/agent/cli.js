#!/usr/bin/env node
import { runCycle } from './loop.js';
import { ensureModel, getLoadTimeMs } from './model.js';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--source') args.source = argv[++i];
    else if (argv[i] === '--execute') args.execute = true;
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log('Usage: npm run cycle -- --source <name|live>');
  process.exit(0);
}

const source = args.source || 'idle-opportunity';

console.log('warming up model...');
const warmStart = Date.now();
await ensureModel();
console.log(`model loaded in ${Date.now() - warmStart} ms (loadTimeMs=${getLoadTimeMs()})`);

console.log('model thinking...');
try {
  const r = await runCycle(source);
  console.log('\n=== Butler cycle ===');
  console.log('source:', r.source);
  console.log('\n-- state --');
  console.log('balances:', r.state.balances);
  console.log('allocation:', r.state.allocation);
  console.log('snapshot:', r.state.snapshot && r.state.snapshot.updatedAt);
  console.log('\n-- proposal --');
  console.log(JSON.stringify(r.proposal, null, 2));
  console.log('\n-- verdict --');
  console.log(r.verdict.toUpperCase());
  if (r.violations && r.violations.length) {
    console.log('violations:');
    for (const v of r.violations) console.log('  -', v);
  }
  console.log('\nattempts:', r.attempts, 'latencyMs:', r.latencyMs, 'loadMs:', r.loadTimeMs, 'inferenceMs:', r.inferenceTimeMs);
  process.exit(0);
} catch (err) {
  console.error('cycle failed:', err && err.message ? err.message : err);
  process.exit(1);
}