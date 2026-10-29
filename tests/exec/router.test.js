import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RouterExecutor } from '../../src/exec/router.js';

test('RouterExecutor throws on unknown venue type before signing', async () => {
  const router = new RouterExecutor({ venues: [{ id: 'bad', type: 'foo' }] });
  await assert.rejects(() => router.supply({ venue: 'bad', amountUsdc: 1n }), /unknown venue type/);
});