export async function watchFunds({ readBalances, intervalMs = 10000, timeoutMs = 0, onChange } = {}) {
  if (typeof readBalances !== 'function') {
    throw new Error('readBalances is required');
  }

  const start = Date.now();
  let last = null;

  // initial
  console.log('waiting for funds (USDC > 0 and ETH > 0)...');

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (timeoutMs > 0 && Date.now() - start >= timeoutMs) {
      throw new Error('timeout waiting for funds');
    }

    let balances;
    try {
      balances = await readBalances();
    } catch (err) {
      console.error('balance read failed:', err && err.message ? err.message : err);
      balances = { usdc: 0n, eth: 0n };
    }

    const changed = !last || last.usdc !== balances.usdc || last.eth !== balances.eth;
    if (changed) {
      console.log(`USDC=${balances.usdc}  ETH=${balances.eth}`);
      if (typeof onChange === 'function') onChange(balances);
    }
    last = balances;

    const usdc = typeof balances.usdc === 'bigint' ? balances.usdc : BigInt(balances.usdc ?? 0);
    const eth = typeof balances.eth === 'bigint' ? balances.eth : BigInt(balances.eth ?? 0);

    if (usdc > 0n && eth > 0n) {
      return { usdc, eth };
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

export default { watchFunds };