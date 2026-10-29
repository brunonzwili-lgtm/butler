import { resolve } from 'node:path';
import WalletManagerEvm from '@tetherto/wdk-wallet-evm';

const seed = process.env.WDK_SEED;
if (!seed) {
  console.error('WDK_SEED is required');
  process.exit(1);
}
const rpc = process.env.RPC_URL || 'https://mainnet.base.org';
const usdc = process.env.USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const { WalletAccountEvm } = await import('@tetherto/wdk-wallet-evm');
try {
  const account = new WalletAccountEvm(seed, "0'/0/0", { provider: rpc, chainId: 8453 });
  const address = await account.getAddress();
  const ethBalance = await account.getBalance();
  const usdcBalance = await account.getTokenBalance(usdc);

  console.log('chainId: 8453 (Base mainnet)');
  console.log('address:', address);
  console.log('ETH balance (wei):', ethBalance.toString());
  console.log('USDC balance (base units):', usdcBalance.toString());

  // Read-only Aave position (no transactions)
  try {
    const { default: AaveProtocolEvm } = await import('@tetherto/wdk-protocol-lending-aave-evm');
    const aave = new AaveProtocolEvm(account);
    const data = await aave.getAccountData();
    console.log('Aave account data:', JSON.stringify(data, (k, v) => (typeof v === 'bigint' ? v.toString() : v)));
  } catch (err) {
    console.log('Aave position unavailable:', err && err.message ? err.message : err);
  }
} finally {

}
process.exit(0);