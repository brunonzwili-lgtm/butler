# AGENTS.md — Butler

## Project

Butler is an **on-device agentic yield rebalancer** built for the **AI Yako hackathon** (QVAC + Tether WDK). It runs a local LLM that proposes portfolio rebalancing actions, validates them with deterministic guardrails, asks the user to confirm, and executes via a WDK EVM wallet — fully offline-capable.

## Stack

- Runtime: Node.js (current LTS).
- Wallet: Tether WDK `wallet-evm` EVM wallet (seed-phrase based, held in memory only).
- Network: **Base Sepolia (chain id 84532)** for development; switchable to **Base mainnet (8453)**.
- Assets: USDC (primary yield asset) and ETH (gas only).
- Venues: idle wallet balance, **Aave V3 USDC supply** on Base.
- Local model: QVAC (emits strict JSON actions).
- Persistence: local only — queue of signed-but-unbroadcast transactions when offline.

## Non-negotiable rules

These override everything else. Enforce in review, not just in prompts.

1. **Never log seed phrases or private keys.** No `console.log`, no debug traces, no error messages may include seed/key material. Mask or hash if identifiers are needed. Seed is read once from secure input, used to construct the wallet, then the input buffer is cleared.
2. **All model output must be strict JSON.** The QVAC model returns a JSON action object and nothing else. Parse with `JSON.parse`; reject on any non-JSON, extra prose, or markdown fences. No tool-call or free-text fallbacks.
3. **Guardrails are plain code, not prompts.** Every constraint (allowed venues, max pct per venue, slippage, gas caps, min balances, allow-listed contracts) is enforced by deterministic JavaScript/TypeScript functions with unit tests. The model never decides policy.
4. **No secret in source.** Keys, seeds, RPC auth tokens live only in env/secure storage. `.env` is gitignored; never commit.
5. **User confirms before execution.** Even after guardrails pass, the loop pauses for explicit user approval. Auto-execute is forbidden.
6. **Offline path still signs locally.** When no RPC/connectivity, sign and queue the tx; never send the seed off-device or fall back to a remote signer.

## Agent loop

```
observe  ->  propose (QVAC, strict JSON)  ->  validate (guardrails, code)  ->  confirm (user)  ->  execute (WDK)
            |                                                              |
            +---> on failure: surface reason, no execution                 +---> if offline: sign + queue
```

- **observe**: read on-chain balances (USDC, ETH) and local yield snapshot (Aave supply APY, idle).
- **propose**: QVAC model returns one JSON action from an allow-listed enum (e.g. `hold`, `supply_to_aave`, `withdraw_from_aave`).
- **validate**: deterministic guardrails check amount, venue, slippage, gas reserve, min balance, and policy limits.
- **confirm**: present the validated plan to the user; require explicit approval.
- **execute**: WDK signs and broadcasts. If offline, sign + enqueue for later broadcast.

## Repository layout (target)

```
src/
  agent/
    loop.js        # observe -> propose -> validate -> confirm -> execute
    propose.js     # QVAC invocation, strict JSON parsing
    guardrails.js  # deterministic policy checks (plain code)
    confirm.js     # user approval prompt
  wallet/
    wdk.js         # WDK EVM wallet wrapper (Base)
    queue.js       # offline signed-tx queue
  data/
    observe.js     # balances + yield snapshot
    venues.js      # venue definitions / allow-list
  config/
    chains.js      # 84532 / 8453
    policy.js      # limits, thresholds
  ui/              # CLI or web surface (if any)
tests/
  guardrails.test.js
  propose.test.js
```

Adjust as the codebase evolves; keep this map current.

## Chain & asset details

- Base Sepolia: chain id `84532`, test USDC + test ETH.
- Base mainnet: chain id `8453`.
- Gas asset is ETH on both. Always reserve a gas buffer; never drain ETH.
- USDC is the only yield-bearing asset; Aave V3 is the only lending venue besides idle wallet.

## Conventions

- Small, single-purpose modules. Guardrails in `src/agent/guardrails.js` (or `.ts`) must be pure functions with no I/O so they are trivially unit-testable.
- RPC/network calls isolated in `data/` and `wallet/`; never in guardrails or prompt parsing.
- Amounts as `bigint` wei/base units internally; format only at the boundary (UI/logs). Use a shared formatter; never log raw user balances alongside identifiers.
- Environment: `CHAIN_ID`, `RPC_URL`, `WDK_SEED` (never logged), `AAVE_POOL_ADDRESS`.
- Errors: throw typed errors; never swallow; never include seed/key in messages.
- Determinism: guardrail functions are pure and side-effect free; tests cover both allow and deny paths including boundary values.

## Testing

- Unit tests mandatory for every guardrail (allow + deny + boundary).
- Integration tests for the loop should use a mock QVAC returning canned JSON and a mock wallet; never a real seed.
- Lint/format before commit. No funds on mainnet in CI.

## Commands

```
npm install
npm run cycle -- --source idle-opportunity   # observe -> propose -> validate (no tx)
npm run run -- --source idle-opportunity --executor mock   # + confirm + execute/queue
npm run flush -- --executor mock              # flush queued intents
npm test                                      # unit + guardrail tests
npm run lint
```

(Update this section once scripts are defined in `package.json`.)

## Working notes for agents

- When adding a new venue or asset, update the allow-list in `venues.js` AND add guardrail tests; do not rely on the model to respect it.
- When changing model prompt/schema, update strict-JSON parser and tests together; the schema is part of the contract.
- Offline queue changes must preserve sign-then-queue ordering and never re-derive keys.
- Prefer minimal diffs; don't refactor unrelated code.
- If you are unsure about a security-relevant detail, stop and ask rather than guess.

## Execution layer (src/exec)

- `src/exec/executor.js` — `Executor` interface: `supply({venue, amountUsdc})`, `withdraw({venue, amountUsdc})`, `estimate()`, `isOnline()`. Implementations: `MockExecutor` (fake `mock-` tx hashes, tests/offline demos) and `AaveBaseExecutor` (Base mainnet only, uses `@tetherto/wdk-protocol-lending-aave-evm`; handles approve internally; respects fee caps). Never run AaveBaseExecutor in tests.
- `src/exec/confirm.js` — CLI confirmation; prints plain-language plan, current vs resulting allocation, estimated fee; requires typing exactly `yes`; records decision in journal.
- `src/exec/queue.js` — `data/queue.jsonl` of approved intents `{id, createdAt, proposal, proposalHash, approvedAt, status}`. `enqueue()`, `pending()`, `markStatus()`.
- `src/exec/flush.js` — `flush(executor, observeFn)`: connectivity check; if offline leave queued; if online re-observe, re-run guardrails, mark `rejected_on_replay` on failure or execute + mark `executed` on success. Never execute without stored approval.
- `src/exec/run.js` — `npm run run -- --source <name|live> --executor mock|aave`: runs cycle, shows "model thinking...", confirms, executes if online else enqueues.
- `src/exec/flush-cli.js` — `npm run flush -- --executor mock|aave [--source ...]`.
- Offline queue stores approved intents, not signed txs: on flush, re-observe + re-validate before execution.

## Deposit flow (src/deposit)

- `npm run deposit [-- --network base|sepolia]` derives the wallet address from `WDK_SEED`, prints it with a terminal QR code, network, accepted asset (USDC), and gas note (warns send only USDC/ETH on Base).
- `src/deposit/watch.js` polls balances every 10s until USDC > 0 and ETH > 0 (configurable), printing changes; supports timeout.
- On funds arrival, asks whether to run the optimizer now (`yes` runs `runCycle('live')`).
- Never logs seed phrases or keys. Mock/test flows work without funds.

## Validated environment (spikes)

- QVAC: `@qvac/sdk` 0.22.0. Registry download of the 1B model timed out in this env; the GGUF was fetched from HuggingFace (`bartowski/Llama-3.2-1B-Instruct-GGUF`, `Llama-3.2-1B-Instruct-Q4_0.gguf`, 773,025,920 bytes) to `spikes/model.gguf`. Load from a local path with `modelType: 'llamacpp-completion'` and `ctx_size: 2048`.
- QVAC JSON: plain prompting was inconsistent (schema drift / garbage). Reliable only with `temperature: 0` + `responseFormat: { type: 'json_schema', ... }`. Offline run (Wi-Fi off) succeeded after the model was cached locally.
- WDK: `@tetherto/wdk-wallet-evm` 1.0.0-beta.24. `WalletManagerEvm(seed, { provider, chainId: 84532, transferMaxFee, transactionMaxFee })` works against `https://sepolia.base.org`; account 0 address `0x9858EfFD232B4033E47d90003D41EC34EcaEda94`; ETH 0 wei; USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e` balance 5,000,000 base units (5 USDC). Provider reports chainId 84532.
- Aave V3 WDK module: `@tetherto/wdk-protocol-lending-aave-evm` 1.0.0-beta.8 supports Base **mainnet** (8453) only — its address map has no Base Sepolia entry. On Sepolia, use plain ethers calls for Aave supply/withdraw through the WDK account; on mainnet the module may be used.
