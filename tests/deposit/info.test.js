import { test } from 'node:test';
import assert from 'node:assert/strict';
import { depositInfo } from '../../src/deposit/info.js';

test('depositInfo includes address and network', () => {
  const out = depositInfo({ address: '0xabc', network: 'sepolia', usdcAddress: '0xusdc' });
  assert.match(out, /0xabc/);
  assert.match(out, /Base Sepolia/);
  assert.match(out, /84532/);
  assert.match(out, /WARNING/);
});

test('address format regex', () => {
  assert.match('0x9858EfFD232B4033E47d90003D41EC34EcaEda94', /^0x[a-fA-F0-9]{40}$/);
});