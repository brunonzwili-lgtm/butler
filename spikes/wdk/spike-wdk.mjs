import WalletManagerEvm from '@tetherto/wdk-wallet-evm';

const seed = process.env.WDK_SEED;
if (!seed) {
  console.error('WDK_SEED env var is required (never commit it).');
  process.exit(1);
}

const BASE_SEPOLIA_RPC = process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org';
const CHAIN_ID = 84532;
const USDC_BASE_SEPOLIA = process.env.USDC_BASE_SEPOLIA || '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

console.log('Creating wallet manager (seed not logged)...');
const wallet = new WalletManagerEvm(seed, {
  provider: BASE_SEPOLIA_RPC,
  chainId: CHAIN_ID,
  transferMaxFee: 100000000000000n,
  transactionMaxFee: 100000000000000n,
});

try {
  const account = await wallet.getAccount(0);
  const address = await account.getAddress();
  console.log('Account 0 address:', address);

  const ethBalance = await account.getBalance();
  console.log('ETH balance (wei):', ethBalance.toString());

  const usdcBalance = await account.getTokenBalance(USDC_BASE_SEPOLIA);
  console.log('USDC balance (base units):', usdcBalance.toString());
  console.log('USDC token address:', USDC_BASE_SEPOLIA);

  // Provider network check
  try {
    const net = await account._provider?.getNetwork?.();
    if (net) console.log('Provider network chainId:', net.chainId?.toString?.() ?? net.chainId);
  } catch (e) {
    // ignore
  }
} catch (err) {
  console.error('SPIKE ERROR:', err);
  process.exitCode = 1;
} finally {
  try { await wallet.dispose?.(); } catch {}
  // clear seed reference
}
// avoid lingering
process.exit(process.exitCode ?? 0);