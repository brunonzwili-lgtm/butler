import qrcode from 'qrcode-terminal';

export const NETWORKS = {
  base: { name: 'Base', chainId: 8453, rpc: 'https://mainnet.base.org' },
  sepolia: { name: 'Base Sepolia', chainId: 84532, rpc: 'https://sepolia.base.org' },
};

export function depositInfo({ address, network = 'base', usdcAddress, ethForGas = 'a small amount' }) {
  const net = NETWORKS[network] || NETWORKS.base;
  const lines = [];
  lines.push('=== Deposit info ===');
  lines.push(`Network: ${net.name} (chain ${net.chainId})`);
  lines.push(`Wallet address: ${address}`);
  lines.push(`Accepted asset: USDC${usdcAddress ? ` (${usdcAddress})` : ''}`);
  lines.push(`Gas: you also need ${ethForGas} of ETH on ${net.name} for transaction fees.`);
  lines.push('WARNING: send ONLY USDC and ETH on this network. Other tokens or chains may be lost.');
  return lines.join('\n');
}

export function printDepositInfo(opts) {
  const net = NETWORKS[opts.network] || NETWORKS.base;
  const text = depositInfo(opts);
  console.log(text);
  console.log('\nScan this QR to copy the address:');
  qrcode.generate(opts.address, { small: true });
  return text;
}

export default { NETWORKS, depositInfo, printDepositInfo };