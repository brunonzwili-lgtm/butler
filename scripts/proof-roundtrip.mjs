import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { createExecutor } from '../src/exec/executor.js';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--venue') args.venue = argv[++i];
    else if (argv[i] === '--amount') args.amount = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const venue = args.venue;
if (!venue) {
  console.error('Usage: node scripts/proof-roundtrip.mjs --venue <id> [--amount <usdc>]');
  process.exit(1);
}
const amountUsd = Number(args.amount ?? '1');
if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
  console.error('amount must be a positive number');
  process.exit(1);
}
const amountBase = BigInt(Math.round(amountUsd * 1_000_000));

const ceiling = BigInt(process.env.MAX_USDC_PER_TX || '5') * 1000000n;
if (amountBase > ceiling) {
  console.error(`amount ${amountBase} exceeds MAX_USDC_PER_TX ceiling ${ceiling}`);
  process.exit(1);
}

const execKind = venue === 'aave-v3-usdc' ? 'aave' : 'erc4626';
const executor = execKind === 'erc4626'
  ? (await import('../src/exec/router.js')).createRouter({})
  : createExecutor('aave', {});
// Configure vault address for erc4626 router via env or config fallback.
if (execKind === 'erc4626' && !executor.erc4626.vaults[venue]) {
  // allow overriding via VAULT_<ID> env, e.g. VAULT_SPARK_USDC
  const envKey = 'VAULT_' + venue.toUpperCase().replace(/-/g, '_');
  if (process.env[envKey]) executor.erc4626.vaults[venue] = process.env[envKey];
}

const explorer = (process.env.CHAIN_ID || '8453') === '8453' ? 'https://basescan.org' : 'https://sepolia.basescan.org';

function link(hash) {
  return hash ? `${explorer}/tx/${hash}` : null;
}

console.log(`Proof round-trip: venue=${venue}, amount=${amountUsd} USDC`);
console.log('supplier address will be resolved by executor...');

mkdirSync('data', { recursive: true });

let supplyRes;
try {
  console.log('\n--- SUPPLY ---');
  supplyRes = await executor.supply({ venue, amountUsdc: amountBase });
  const hash = supplyRes?.txHash ?? supplyRes?.hash;
  console.log('supply tx:', hash);
  console.log('supply link:', link(hash));
  console.log('supply result:', JSON.stringify(supplyRes, (k, v) => (typeof v === 'bigint' ? v.toString() : v)));
} catch (err) {
  console.error('SUPPLY FAILED:', err && err.message ? err.message : err);
  process.exit(1);
}

let withdrawRes;
try {
  console.log('\n--- WITHDRAW (full position) ---');
  const isErc4626 = execKind === 'erc4626';
  withdrawRes = await executor.withdraw({ venue, amountUsdc: isErc4626 ? 'max' : amountBase });
  const hash = withdrawRes?.txHash ?? withdrawRes?.hash;
  console.log('withdraw tx:', hash);
  console.log('withdraw link:', link(hash));
  console.log('withdraw result:', JSON.stringify(withdrawRes, (k, v) => (typeof v === 'bigint' ? v.toString() : v)));
} catch (err) {
  console.error('WITHDRAW FAILED:', err && err.message ? err.message : err);
  process.exit(1);
}

// Append to data/proof.md
const lines = [];
lines.push(`## ${new Date().toISOString()} — ${venue} round trip (${amountUsd} USDC)`);
lines.push(`- supply tx: ${supplyRes?.txHash ?? supplyRes?.hash}`);
lines.push(`  - ${link(supplyRes?.txHash ?? supplyRes?.hash)}`);
lines.push(`- withdraw tx: ${withdrawRes?.txHash ?? withdrawRes?.hash}`);
lines.push(`  - ${link(withdrawRes?.txHash ?? withdrawRes?.hash)}`);
lines.push('');
const proofPath = 'data/proof.md';
appendFileSync(proofPath, lines.join('\n'), 'utf8');
console.log(`\nResults appended to ${proofPath}`);

process.exit(0);`