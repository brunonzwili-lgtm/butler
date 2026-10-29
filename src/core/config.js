// Deterministic policy configuration for Butler.
// Guardrails read from this; the model never sees or edits it.

export const defaultConfig = {
  // Snapshot freshness
  maxAgeHours: 24,

  // Move limits
  maxMovePct: 50,        // a single proposal may move at most this % of the portfolio
  venueCapPct: 80,       // no venue may exceed this % of the portfolio after a move

  // Yield gating
  minApyGap: 0.25,        // (to APY - from APY) must be >= this many percentage points

  // Gas
  ethGasReserveWei: 1000000000000000n, // 0.001 ETH kept for gas on both chains

  // Known venues (allow-list). The model cannot introduce new ones.
  // type: "idle" | "aave" | "erc4626"
  venues: [
    { id: 'idle', type: 'idle', address: null, capPct: 80 },
    { id: 'aave-v3-usdc', type: 'aave', address: null, capPct: 50 },
    { id: 'moonwell-flagship-usdc', type: 'erc4626', address: '0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca', capPct: 40 },
    { id: 'clearstar-cbassets-usdc', type: 'erc4626', address: '0x91C056B6d4311a743614FBc03ac32d4E6A2d3a3c', capPct: 40 },
    { id: 'spark-usdc', type: 'erc4626', address: '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A', capPct: 40 },
  ],
};

export const config = defaultConfig;
export default defaultConfig;