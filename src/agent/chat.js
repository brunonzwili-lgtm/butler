#!/usr/bin/env node
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readFileSync, existsSync } from 'node:fs';
import { runCycle } from './loop.js';
import { createExecutor } from '../exec/executor.js';
import { enqueue } from '../exec/queue.js';
import { validate } from '../core/guardrails.js';
import { defaultConfig } from '../core/config.js';

if (!process.env.WDK_SEED) {
  try {
    const p = join(homedir(), '.butler-mainnet.seed');
    if (existsSync(p)) process.env.WDK_SEED = readFileSync(p, 'utf8').trim();
  } catch {}
}

console.log('Butler chat. Commands: optimize [source], status [source], deposit, protocols, approve, reject, exit.');
console.log('Default source: idle-opportunity. Default executor: mock.\n');

const rl = readline.createInterface({ input, output });
let pending = null;

while (true) {
  const line = (await rl.question('> ')).trim();
  if (!line) continue;
  const [cmd, ...rest] = line.split(/\s+/);
  const source = rest[0] || 'idle-opportunity';

  try {
    if (cmd === 'help') {
      console.log('optimize [source]  run a cycle and show the proposal');
      console.log('status [source]    show balances/allocation/snapshot');
      console.log('balance [source]   show wallet balances only');
      console.log('deposit            show the wallet deposit address');
      console.log('protocols          show integrated venues and APY');
      console.log('approve            approve the pending proposal (asks amount)');
      console.log('reject             reject the pending proposal');
      console.log('exit               quit');
    } else if (cmd === 'deposit') {
      const seed = process.env.WDK_SEED;
      if (!seed) { console.log('Set WDK_SEED or create ~/.butler-mainnet.seed to show your address.'); continue; }
      const { default: WalletManagerEvm } = await import('@tetherto/wdk-wallet-evm');
      const chainId = Number(process.env.CHAIN_ID || 84532);
      const rpc = process.env.RPC_URL || (chainId === 8453 ? 'https://mainnet.base.org' : 'https://sepolia.base.org');
      const w = new WalletManagerEvm(seed, { provider: rpc, chainId });
      const a = await w.getAccount(0);
      const addr = await a.getAddress();
      const { printDepositInfo } = await import('../deposit/info.js');
      printDepositInfo({ address: addr, network: chainId === 8453 ? 'base' : 'sepolia', usdcAddress: process.env.USDC_ADDRESS });
      await w.dispose?.();
    } else if (cmd === 'protocols') {
      const y = JSON.parse(readFileSync('data/yields.json', 'utf8'));
      for (const v of y.venues) console.log(`${v.id}: ${(v.apy ?? 0).toFixed(2)}%  (${v.sourceUrl})`);
    } else if (cmd === 'balance') {
      const { observe } = await import('./observe.js');
      const st = await observe(source);
      console.log('USDC:', st.balances.usdc, '  ETH(wei):', st.balances.ethWei);
      console.log('allocation:', st.allocation);
    } else if (cmd === 'status') {
      const { observe } = await import('./observe.js');
      const st = await observe(source);
      console.log('balances:', st.balances);
      console.log('allocation:', st.allocation);
      console.log('snapshot:', st.snapshot && st.snapshot.updatedAt);
    } else if (cmd === 'optimize') {
      console.log('model thinking...');
      const r = await runCycle(source);
      pending = r.verdict === 'approved' ? r : null;
      console.log('balances:', r.state.balances, 'allocation:', r.state.allocation);
      console.log('verdict:', r.verdict);
      if (r.violations?.length) console.log('violations:', r.violations);
      const p = r.proposal;
      console.log(`I see ${p.amountPct}% candidate from ${p.from} to ${p.to}. Reason: ${p.reason}`);
      console.log('attempts:', r.attempts, 'loadMs:', r.loadTimeMs, 'inferMs:', r.inferenceTimeMs);
      if (pending) console.log('Reply "approve" (I will ask amount) or "reject".');
    } else if (cmd === 'approve') {
      if (!pending) { console.log('No pending approved proposal.'); continue; }
      const defaultPct = pending.proposal.amountPct ?? 25;
      const inputAmt = (await rl.question(`How much % of portfolio to move? (default ${defaultPct}): `)).trim();
      const pct = inputAmt === '' ? defaultPct : Number(inputAmt);
      if (!Number.isFinite(pct) || pct <= 0 || pct > (defaultConfig.maxMovePct ?? 50)) {
        console.log('Invalid amount; cancelled.');
        pending = null;
        continue;
      }
      const replayProposal = { ...pending.proposal, amountPct: pct, amount_pct: pct };
      const verdict = validate(replayProposal, pending.state, defaultConfig);
      if (!verdict.ok) {
        console.log('Blocked by guardrails:', verdict.violations);
        console.log('Hint: enter 25 (default) or another value that keeps every venue at or below 80%.');
        pending = null;
        continue;
      }
      const base = pending.state?.balances?.usdc ?? 0n;
      const amount = (BigInt(base) * BigInt(Math.round(pct * 100))) / 10000n;
      const isOffline = process.env.OFFLINE === '1';
      const { createExecutor } = await import('../exec/executor.js');
      const executor = createExecutor('mock');
      if (isOffline) {
        const { enqueue } = await import('../exec/queue.js');
        const intent = enqueue(replayProposal, { amountUsdc: amount.toString() });
        console.log(`Queued offline (no broadcast): ${amount} base units. intent=${intent.id}`);
      } else {
        const isSupply = replayProposal.from === 'idle' && replayProposal.to === 'aave-v3-usdc';
        const res = isSupply
          ? await executor.supply({ venue: replayProposal.to, amountUsdc: amount })
          : await executor.withdraw({ venue: replayProposal.from, amountUsdc: amount });
        console.log(`Done. tx=${res.txHash} amount=${amount} base units`);
      }
      pending = null;
    } else if (cmd === 'reject') {
      pending = null;
      console.log('Rejected; nothing executed.');
    } else if (cmd === 'exit' || cmd === 'quit') {
      break;
    } else {
      console.log('Unknown command. Type "help".');
    }
  } catch (err) {
    console.error('error:', err && err.message ? err.message : err);
  }
}

rl.close();
process.exit(0);
