import { ethers } from 'ethers';

const VAULT_ABI = [
  'function asset() view returns (address)',
  'function totalAssets() view returns (uint256)',
  'function previewDeposit(uint256) view returns (uint256)',
  'function deposit(uint256 assets, address receiver) returns (uint256 shares)',
  'function withdraw(uint256 assets, address receiver, address owner) returns (uint256 shares)',
  'function redeem(uint256 shares, address receiver, address owner) returns (uint256 assets)',
];

export class Erc4626Executor {
  constructor(config = {}) {
    this.config = config;
    this.chainId = Number(process.env.CHAIN_ID || config.chainId || 8453);
    this.rpc = process.env.RPC_URL || (this.chainId === 8453 ? 'https://mainnet.base.org' : 'https://sepolia.base.org');
    this.usdc = process.env.USDC_ADDRESS || (this.chainId === 8453
      ? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
      : '0x036CbD53842c5426634e7929541eC2318f3dCF7e');
    // map venue id -> vault address
    this.vaults = config.vaults || {};
    this._verified = new Set();
    this._accountPromise = null;
  }

  async _account() {
    if (this._accountPromise) return this._accountPromise;
    this._accountPromise = (async () => {
      const seed = process.env.WDK_SEED;
      if (!seed) throw new Error('WDK_SEED is required for erc4626 execution');
      const { WalletAccountEvm } = await import('@tetherto/wdk-wallet-evm');
      const account = new WalletAccountEvm(seed, "0'/0/0", {
        provider: this.rpc,
        chainId: this.chainId,
        transferMaxFee: this.config.transferMaxFee ?? 100000000000000n,
        transactionMaxFee: this.config.transactionMaxFee ?? 100000000000000n,
      });
      return { account };
    })();
    return this._accountPromise;
  }

  async isOnline() {
    try {
      const res = await fetch(this.rpc, {
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

  async _vaultAddress(venue) {
    const addr = this.vaults[venue];
    if (!addr) throw new Error(`no vault address configured for ${venue}`);
    return addr;
  }

  async _verifyAsset(vaultAddress) {
    if (this._verified.has(vaultAddress)) return;
    const provider = new ethers.JsonRpcProvider(this.rpc);
    const vault = new ethers.Contract(vaultAddress, VAULT_ABI, provider);
    const asset = await vault.asset();
    if (asset.toLowerCase() !== this.usdc.toLowerCase()) {
      throw new Error(`vault asset ${asset} != configured USDC ${this.usdc}`);
    }
    this._verified.add(vaultAddress);
  }

  _ceilingCheck(amount) {
    const ceiling = BigInt(process.env.MAX_USDC_PER_TX || '5') * 1000000n;
    if (BigInt(amount) > ceiling) {
      throw new Error(`amount ${amount} exceeds MAX_USDC_PER_TX ceiling ${ceiling}`);
    }
  }

  async supply({ venue, amountUsdc }) {
    const amount = BigInt(amountUsdc);
    this._ceilingCheck(amount);
    const vaultAddress = await this._vaultAddress(venue);
    await this._verifyAsset(vaultAddress);
    const { account } = await this._account();
    const iface = new ethers.Interface(['function approve(address spender, uint256 amount)']);
    const approveData = iface.encodeFunctionData('approve', [vaultAddress, amount]);
    await account.sendTransaction({ to: this.usdc, value: 0n, data: approveData });
    const vaultIface = new ethers.Interface(['function deposit(uint256 assets, address receiver) returns (uint256)']);
    const depositData = vaultIface.encodeFunctionData('deposit', [amount, await account.getAddress()]);
    const res = await account.sendTransaction({ to: vaultAddress, value: 0n, data: depositData });
    return { txHash: res.hash ?? res.txHash, fee: res.fee ?? 0n };
  }

  async withdraw({ venue, amountUsdc }) {
    const vaultAddress = await this._vaultAddress(venue);
    await this._verifyAsset(vaultAddress);
    const { account } = await this._account();
    const owner = await account.getAddress();

    if (amountUsdc === 'max' || amountUsdc === 0 || amountUsdc === '0') {
      // Close the position fully via redeem(maxRedeem(owner)) to avoid share rounding dust.
      const provider = new ethers.JsonRpcProvider(this.rpc);
      const vault = new ethers.Contract(vaultAddress, VAULT_ABI, provider);
      const shares = await vault.maxRedeem(owner);
      if (shares === 0n) return { txHash: null, fee: 0n, note: 'no shares to redeem' };
      const iface = new ethers.Interface(['function redeem(uint256 shares, address receiver, address owner) returns (uint256)']);
      const data = iface.encodeFunctionData('redeem', [shares, owner, owner]);
      const res = await account.sendTransaction({ to: vaultAddress, value: 0n, data });
      return { txHash: res.hash ?? res.txHash, fee: res.fee ?? 0n, shares: shares.toString() };
    }

    const amount = BigInt(amountUsdc);
    this._ceilingCheck(amount);
    const iface = new ethers.Interface(['function withdraw(uint256 assets, address receiver, address owner) returns (uint256)']);
    const data = iface.encodeFunctionData('withdraw', [amount, owner, owner]);
    const res = await account.sendTransaction({ to: vaultAddress, value: 0n, data });
    return { txHash: res.hash ?? res.txHash, fee: res.fee ?? 0n };
  }

  async estimate() {
    return { fee: 0n };
  }
}

export default Erc4626Executor;