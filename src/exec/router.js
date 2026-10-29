import { Erc4626Executor } from './erc4626Executor.js';
import { AaveBaseExecutor } from './executor.js';

function venueType(config, venue) {
  const v = (config.venues || []).find((x) => (typeof x === 'string' ? x : x.id) === venue);
  if (!v) return 'erc4626';
  const type = typeof v === 'string' ? (v === 'aave-v3-usdc' ? 'aave' : 'erc4626') : (v.type || 'erc4626');
  if (!['idle', 'aave', 'erc4626'].includes(type)) {
    throw new Error(`unknown venue type: ${type}`);
  }
  return type;
}

function vaultMap(config) {
  const m = {};
  for (const v of (config.venues || [])) {
    if (typeof v !== 'string' && v.type === 'erc4626' && v.address) m[v.id] = v.address;
  }
  return m;
}

export class RouterExecutor {
  constructor(config = {}) {
    this.config = config;
    this.aave = new AaveBaseExecutor(config);
    this.erc4626 = new Erc4626Executor({ ...config, vaults: vaultMap(config) });
    this.chainId = this.erc4626.chainId;
    this.usdcAddress = this.erc4626.usdc;
  }
  async isOnline() {
    return this.erc4626.isOnline();
  }
  async supply({ venue, amountUsdc }) {
    if (venueType(this.config, venue) === 'aave') return this.aave.supply({ venue, amountUsdc });
    return this.erc4626.supply({ venue, amountUsdc });
  }
  async withdraw({ venue, amountUsdc }) {
    if (venueType(this.config, venue) === 'aave') return this.aave.withdraw({ venue, amountUsdc });
    return this.erc4626.withdraw({ venue, amountUsdc });
  }
  async estimate() {
    return { fee: 0n };
  }
}

export function createRouter(config = {}) {
  return new RouterExecutor(config);
}

export default { RouterExecutor, createRouter };