import { ethers } from 'ethers';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--vault') args.vault = argv[++i];
    else if (argv[i] === '--rpc') args.rpc = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (!args.vault) {
  console.error('Usage: node scripts/vault-check.mjs --vault <vault address> [--rpc <url>]');
  process.exit(1);
}

const rpc = args.rpc || process.env.RPC_URL || 'https://mainnet.base.org';
const provider = new ethers.JsonRpcProvider(rpc);
const vault = new ethers.Contract(args.vault, [
  'function asset() view returns (address)',
  'function totalAssets() view returns (uint256)',
  'function previewDeposit(uint256) view returns (uint256)',
], provider);

const USDC = process.env.USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

try {
  const asset = await vault.asset();
  const totalAssets = await vault.totalAssets();
  const oneUsdc = 1000000n;
  const preview = await vault.previewDeposit(oneUsdc);
  console.log('rpc:', rpc);
  console.log('vault:', args.vault);
  console.log('asset():', asset);
  console.log('expected USDC:', USDC);
  console.log('asset matches USDC:', asset.toLowerCase() === USDC.toLowerCase());
  console.log('totalAssets():', totalAssets.toString());
  console.log('previewDeposit(1 USDC):', preview.toString(), 'shares');
} catch (err) {
  console.error('vault-check failed:', err && err.message ? err.message : err);
  process.exit(1);
}
process.exit(0);