import WalletManagerEvm from '@tetherto/wdk-wallet-evm';

const seed = process.env.WDK_SEED;
if (!seed) {
  console.error('WDK_SEED is required');
  process.exit(1);
}
const rpc = process.env.RPC_URL || 'https://sepolia.base.org';
const usdc = process.env.USDC_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

const wallet = new WalletManagerEvm(seed, { provider: rpc, chainId: 84532 });
try {
  const account = await wallet.getAccount(0);
  const address = await account.getAddress();
  const eth = await account.getBalance();
  const usdcBal = await account.getTokenBalance(usdc);
  console.log('chainId: 84532 (Base Sepolia)');
  console.log('address:', address);
  console.log('ETH balance (wei):', eth.toString());
  console.log('USDC balance (base units):', usdcBal.toString());
  console.log('USDC (human):', Number(usdcBal) / 1e6);
} finally {
  try { await wallet.dispose?.(); } catch {}
}
process.exit(0);