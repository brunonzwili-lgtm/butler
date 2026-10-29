import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Erc4626Executor } from '../../src/exec/erc4626Executor.js';

test('Erc4626Executor enforces MAX_USDC_PER_TX ceiling', async () => {
  const ex = new Erc4626Executor({ vaults: { 'vault-usdc': '0x0000000000000000000000000000000000000000' } });
  process.env.MAX_USDC_PER_TX = '1';
  await assert.rejects(() => ex.supply({ venue: 'vault-usdc', amountUsdc: 2000000n }), /exceeds MAX_USDC_PER_TX/);
  delete process.env.MAX_USDC_PER_TX;
});

test('Erc4626Executor throws on unknown venue', async () => {
  const ex = new Erc4626Executor({ vaults: {} });
  await assert.rejects(() => ex.supply({ venue: 'nope', amountUsdc: 1n }), /no vault address configured/);
});