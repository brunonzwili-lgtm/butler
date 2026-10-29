#!/usr/bin/env node
import { flush } from './flush.js';
import { createExecutor } from './executor.js';
import { observe } from '../agent/observe.js';

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
  console.log('Usage: npm run flush -- --executor mock|aave [--source <name|live>]');
  process.exit(0);
}

const executorKind = args.executor || 'mock';
let source = args.source;
if (!source) {
  source = process.env.WDK_SEED ? 'live' : 'idle-opportunity';
}

let executor;
if (executorKind === 'router' || executorKind === 'live') {
  const { createRouter } = await import('./router.js');
  executor = createRouter({});
} else {
  executor = createExecutor(executorKind);
}
const observeFn = async () => observe(source);

console.log(`Flushing queue with ${executorKind} executor (source=${source})...`);
const results = await flush(executor, observeFn);

if (results.length === 0) {
  console.log('No pending intents.');
} else {
  for (const r of results) {
    console.log(JSON.stringify(r));
  }
}
process.exit(0);