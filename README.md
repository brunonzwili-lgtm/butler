# Butler

On-device agentic yield rebalancer for the AI Yako hackathon (QVAC + Tether WDK).

## Commands

```bash
npm run chat                                   # interactive assistant: protocols, optimize, approve, status, deposit
npm run cycle -- --source idle-opportunity      # observe -> propose -> validate (no tx)
npm run run -- --source idle-opportunity --executor mock   # + confirm + execute/queue
npm run flush -- --executor mock               # flush queued intents
npm run ui                                     # local web UI at http://127.0.0.1:3000
npm test                                       # unit tests
```

## Chat usage

```bash
npm run chat
```

Try: `protocols`, `status`, `optimize`, `approve` (it asks amount), `deposit`, `exit`.
Offline chat uses cached fixtures only: `OFFLINE=1 npm run chat`.

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

## Limitations and scope

- APYs are **native/net-of-rewards** figures only. Merkl/incentive-token rewards are shown in `data/yields.json` but are not counted as collectable yield.
- ERC-4626 full exits use `redeem(maxRedeem(owner))`; vault liquidity can cap redemption size, and rounding dust is possible.
- Aave V3 is native (not ERC-4626); supply and withdraw use the Aave protocol calls directly.
- Yield-gain spreads are small (≈0.2–1.6pp), so with `minApyGap` the agent will often hold. This is intentional to avoid churning and paying gas on small balances.
- Live transaction proof is recorded in `data/proof.md` as round trips are run; until then, demos use `MockExecutor`.
- Only a local 1B model is used. Candidate enumeration plus forced JSON schema keeps outputs valid, with retry and ranked fallback on failure.
- Fiat on-ramps and mobile-money flows are roadmap ideas, not verified integrations.
- A polished pooled-vault (shared deposits) is roadmap, not implemented.

## Offline run (no Wi-Fi)

Pre-flight (with internet, once):
1. Install deps: `npm install`
2. Download model to `spikes/model.gguf` (see `AGENTS.md`).
3. Warm up: `npm run cycle -- --source idle-opportunity`

Then turn Wi-Fi off and run:
```bash
OFFLINE=1 MAX_USDC_PER_TX=2 printf 'yes\n' | env OFFLINE=1 npm run run -- --source idle-opportunity --executor mock
npm run flush -- --executor mock
```

What works offline:
- Local model inference (QVAC GGUF cached locally)
- Candidate enumeration + deterministic guardrails
- Confirmation prompt
- Offline intent queue (`data/queue.jsonl`)
- Flush after reconnect

What needs internet:
- `--source live` (Base RPC balances/Aave)
- Model download
- `scripts/mainnet-check.mjs`, `scripts/vault-check.mjs`, `scripts/proof-roundtrip.mjs`
- Refreshing APYs/timestamps

## Mainnet run order

Fund → mainnet-check → one supply → one withdraw → save proof links. This is the judging evidence of live execution.
