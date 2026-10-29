# Butler

On-device agentic yield rebalancer for the AI Yako hackathon (QVAC + Tether WDK).

## Commands

```bash
npm run cycle -- --source idle-opportunity   # observe -> propose -> validate (no tx)
npm run run -- --source idle-opportunity --executor mock   # + confirm + execute/queue
npm run flush -- --executor mock              # flush queued intents
npm test                                      # unit tests
```

## APY basis

All APYs are recorded as **native/net-of-rewards** figures (excluding incentive tokens), taken from the official Morpho/Aave app pages. Net APY excluding rewards is used so the agent only counts yield it can actually collect through a plain deposit and redeem. Reward-token APRs are noted in `data/yields.json` but not counted.

## Verified venues (asset() == Base USDC)

- Aave V3 USDC — protocol APR ~4.13% (+1.32% Merkl reward APR), native basis
- Moonwell Flagship USDC — net 5.29%
- Clearstar cbAssets USDC — native 5.40% (7.20% incl. rewards)
- Spark USDC — 5.62%

Live transaction proof: see `data/proof.md` (round trips pending).

## Mainnet run checklist

Use a fresh wallet with only a few dollars of USDC plus a small amount of ETH on Base.

1. Fund the fresh wallet with about $5 USDC and a small amount of ETH on Base.
2. Set `WDK_SEED`, `RPC_URL` (Base mainnet), `USDC_ADDRESS`, `CHAIN_ID=8453`, `MAX_USDC_PER_TX=5` in the environment. Never paste the seed into chat or commit it.
3. Run `node scripts/mainnet-check.mjs` and confirm the printed address, ETH balance, USDC balance, and Aave USDC supply position match the explorer.
4. Run one real supply: `npm run run -- --source live --executor aave` and confirm the transaction.
5. Run one real withdraw and confirm.
6. Save both transaction hashes and explorer links in `data/proof.md`.

## Mainnet run order

Fund → mainnet-check → one supply → one withdraw → save proof links. This is the judging evidence of live execution.
