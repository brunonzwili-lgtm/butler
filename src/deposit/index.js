#!/usr/bin/env node
import { runCycle } from '../agent/loop.js';
import { printDepositInfo } from './info.js';
import { watchFunds } from './watch.js';
import readline from 'node:readline';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--network') args.network = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log('Usage: npm run deposit -- --network base|sepolia');
  process.exit(0);
}

const network = args.network === 'sepolia' ? 'sepolia' : 'base';
const chainId = network === 'sepolia' ? 84532 : 8453;
const rpc = network === 'sepolia' ? (process.env.RPC_URL || 'https://sepolia.base.org') : (process.env.RPC_URL || 'https://mainnet.base.org');
const usdcAddress = process.env.USDC_ADDRESS || (network === 'sepolia'
  ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
  : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');

const seed = process.env.WDK_SEED;
if (!seed) {
  console.error('WDK_SEED is required to show your deposit address.');
  process.exit(1);
}

const { default: WalletManagerEvm } = await import('@tetherto/wdk-wallet-evm');
const wallet = new WalletManagerEvm(seed, { provider: rpc, chainId });
let address;
try {
  const account = await wallet.getAccount(0);
  address = await account.getAddress();

  printDepositInfo({ address, network, usdcAddress });

  const readBalances = async () => {
    const acct = await wallet.getAccount(0);
    const eth = await acct.getBalance();
    const usdc = await acct.getTokenBalance(usdcAddress);
    return { usdc, eth };
  };

  const funds = await watchFunds({ readBalances, intervalMs: 10000 });

  console.log(`\nFunds detected: ${Number(funds.usdc) / 1e6} USDC, ${Number(funds.eth) / 1e18} ETH.`);

  const yes = await new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Run optimizer now? (yes/no) ', (a) => {
      rl.close();
      resolve(String(a).trim().toLowerCase() === 'yes');
    });
  });

  if (yes) {
    console.log('\nStarting optimizer...');
    const result = await runCycle('live');
    console.log('verdict:', result.verdict);
    if (result.violations && result.violations.length) console.log('violations:', result.violations);
  } else {
    console.log('Skipped optimizer.');
  }
} finally {
  try { await wallet.dispose?.(); } catch {}
}
process.exit(0);