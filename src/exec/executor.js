import crypto from 'node:crypto';
import { Erc4626Executor } from './erc4626Executor.js';

export class Executor {
  async supply({ venue, amountUsdc }) { throw new Error('not implemented'); }
  async withdraw({ venue, amountUsdc }) { throw new Error('not implemented'); }
  async estimate() { throw new Error('not implemented'); }
  async isOnline() { return true; }
}

export class MockExecutor extends Executor {
  constructor() {
    super();
    this.calls = [];
  }
  async supply({ venue, amountUsdc }) {
    this.calls.push({ type: 'supply', venue, amountUsdc });
    return { txHash: `mock-supply-${crypto.randomUUID()}`, fee: 0n };
  }
  async withdraw({ venue, amountUsdc }) {
    this.calls.push({ type: 'withdraw', venue, amountUsdc });
    return { txHash: `mock-withdraw-${crypto.randomUUID()}`, fee: 0n };
  }
  async estimate() {
    return { fee: 0n };
  }
  async isOnline() {
    return process.env.OFFLINE !== '1';
  }
}

export class AaveBaseExecutor extends Executor {
  constructor(config = {}) {
    super();
    this.config = config;
    this.chainId = 8453;
  }
  async _aave() {
    if (this._cached) return this._cached;
    const seed = process.env.WDK_SEED;
    if (!seed) throw new Error('WDK_SEED is required for Aave base executor');
    const rpc = process.env.RPC_URL || 'https://mainnet.base.org';
    const usdc = process.env.USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    const { WalletAccountEvm } = await import('@tetherto/wdk-wallet-evm');
    const { default: AaveProtocolEvm } = await import('@tetherto/wdk-protocol-lending-aave-evm');
    const account = new WalletAccountEvm(seed, "0'/0/0", {
      provider: rpc,
      chainId: this.chainId,
      transferMaxFee: this.config.transferMaxFee ?? 100000000000000n,
      transactionMaxFee: this.config.transactionMaxFee ?? 100000000000000n,
    });
    const aave = new AaveProtocolEvm(account);
    this._cached = { account, aave, usdc };
    return this._cached;
  }
  async isOnline() {
    try {
      const res = await fetch(process.env.RPC_URL || 'https://mainnet.base.org', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
  async supply({ venue, amountUsdc }) {
    const amt = BigInt(amountUsdc);
    const ceiling = BigInt(process.env.MAX_USDC_PER_TX || '5') * 1000000n;
    if (amt > ceiling) {
      throw new Error(`supply amount ${amt} exceeds MAX_USDC_PER_TX ceiling ${ceiling}`);
    }
    const { account, aave, usdc } = await this._aave();
    const { AaveV3Base } = await import('@bgd-labs/aave-address-book');
    const spender = AaveV3Base.POOL;
    // Approve the exact amount only (never unlimited).
    await account.approve({ token: usdc, spender, amount: amt });
    return aave.supply({ token: usdc, amount: amt });
  }
  async withdraw({ venue, amountUsdc }) {
    const amt = BigInt(amountUsdc);
    const ceiling = BigInt(process.env.MAX_USDC_PER_TX || '5') * 1000000n;
    if (amt > ceiling) {
      throw new Error(`withdraw amount ${amt} exceeds MAX_USDC_PER_TX ceiling ${ceiling}`);
    }
    const { aave, usdc } = await this._aave();
    return aave.withdraw({ token: usdc, amount: amt });
  }
  async estimate() {
    return { fee: 0n };
  }
}

export function createExecutor(kind = 'mock', config = {}) {
  if (kind === 'aave') return new AaveBaseExecutor(config);
  if (kind === 'erc4626') return new Erc4626Executor(config);
  return new MockExecutor();
}

export default { Executor, MockExecutor, AaveBaseExecutor, createExecutor };