#!/usr/bin/env node
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { runCycle } from './loop.js';
import { createExecutor } from '../exec/executor.js';
import { enqueue } from '../exec/queue.js';

console.log('Butler chat. Commands: optimize [source], status [source], approve, reject, help, exit.');
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
      console.log('status [source]    show balances/allocation/snapshot')
      console.log('deposit            show the wallet deposit address');
      console.log('approve            approve the pending proposal');
      console.log('reject             reject the pending proposal');
      console.log('protocols           show integrated venues and APY');
      console.log('exit                quit');
    } else if (cmd === 'deposit') {
      const { printDepositInfo } = await import('../deposit/info.js');
      const seed = process.env.WDK_SEED;
      if (!seed) { console.log('Set WDK_SEED to show your address.'); continue; }
      const { default: WalletManagerEvm } = await import('@tetherto/wdk-wallet-evm');
      const chainId = Number(process.env.CHAIN_ID || 84532);
      const rpc = process.env.RPC_URL || (chainId === 8453 ? 'https://mainnet.base.org' : 'https://sepolia.base.org');
      const w = new WalletManagerEvm(seed, { provider: rpc, chainId });
      const a = await w.getAccount(0);
      const addr = await a.getAddress();
      await w.dispose?.();
      printDepositInfo({ address: addr, network: chainId === 8453 ? 'base' : 'sepolia', usdcAddress: process.env.USDC_ADDRESS });
    } else if (cmd === 'protocols') {
      const { readFileSync } = await import('node:fs');
      const y = JSON.parse(readFileSync('data/yields.json','utf8'));
      for (const v of y.venues) console.log(`${v.id}: ${(v.apy??0).toFixed(2)}%  (${v.sourceUrl})`);
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
      console.log('verdict:', r.verdict);
      if (r.violations?.length) console.log('violations:', r.violations);
      const p = r.proposal;
      console.log(`I propose: move ${p.amountPct}% (${p.action}) from ${p.from} to ${p.to}. Reason: ${p.reason}`);
      console.log('attempts:', r.attempts, 'loadMs:', r.loadTimeMs, 'inferMs:', r.inferenceTimeMs);
      if (pending) console.log('Reply "approve" to execute/queue, or "reject" to cancel.');
    } else if (cmd === 'approve') {
      if (!pending) { console.log('No pending approved proposal.'); continue; }
      const amount = pending.state?.balances?.usdc ?? 0n;
      const isOffline = process.env.OFFLINE === '1';
      const executor = createExecutor('mock');
      if (isOffline) {
        const intent = enqueue(pending.proposal, { amountUsdc: String(amount) });
        console.log('Offline: queued intent', intent.id);
      } else {
        const isSupply = pending.proposal.from === 'idle' && pending.proposal.to === 'aave-v3-usdc';
        const res = isSupply
          ? await executor.supply({ venue: pending.proposal.to, amountUsdc: amount })
          : await executor.withdraw({ venue: pending.proposal.from, amountUsdc: amount });
        console.log('Executed (mock):', res.txHash);
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