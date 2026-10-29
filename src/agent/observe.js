import { readFileSync } from 'node:fs';
import { loadSnapshot } from '../core/snapshot.js';
import { computeAllocation } from '../core/allocation.js';
import { defaultConfig } from '../core/config.js';

const SCENARIOS_DIR = 'data/scenarios';

function toBigInt(value) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  if (typeof value === 'string') return BigInt(value);
  if (value == null) return 0n;
  throw new TypeError('amount must be bigint, number, or string');
}

function normalizeFixture(raw, config) {
  const balances = {
    usdc: toBigInt(raw.balances?.usdc ?? 0),
    ethWei: toBigInt(raw.balances?.ethWei ?? raw.balances?.eth ?? 0),
  };
  const positions = {};
  for (const [k, v] of Object.entries(raw.positions || {})) {
    positions[k] = toBigInt(v);
  }
  if (positions.idle == null) positions.idle = balances.usdc;

  const snapshot = raw.snapshot;
  // validate
  // (loadSnapshot already validated if from disk; here validate lightly)
  const state = { balances, positions, snapshot };
  state.allocation = computeAllocation(state);
  return state;
}

async function observeFixture(name) {
  const file = name.endsWith('.json') ? name : `${name}.json`;
  const path = `${SCENARIOS_DIR}/${file}`;
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return normalizeFixture(raw, defaultConfig);
}

async function observeLive() {
  const seed = process.env.WDK_SEED;
  if (!seed) throw new Error('WDK_SEED is required for live source');

  const rpc = process.env.RPC_URL || 'https://sepolia.base.org';
  const chainId = Number(process.env.CHAIN_ID || 84532);
  const usdcAddress = process.env.USDC_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

  const { default: WalletManagerEvm } = await import('@tetherto/wdk-wallet-evm');
  const wallet = new WalletManagerEvm(seed, {
    provider: rpc,
    chainId,
    transferMaxFee: 100000000000000n,
    transactionMaxFee: 100000000000000n,
  });

  try {
    const account = await wallet.getAccount(0);
    const ethWei = await account.getBalance();
    const usdc = await account.getTokenBalance(usdcAddress);

    const snapshot = loadSnapshot('data/yields.json', defaultConfig);
    const state = {
      balances: { usdc, ethWei },
      positions: { idle: usdc, 'aave-v3-usdc': 0n },
      snapshot,
    };
    state.allocation = computeAllocation(state);
    return state;
  } finally {
    try { await wallet.dispose?.(); } catch {}
  }
}

export async function observe(source = 'live', options = {}) {
  if (source === 'live') return observeLive(options);
  return observeFixture(source, options);
}

export default { observe };