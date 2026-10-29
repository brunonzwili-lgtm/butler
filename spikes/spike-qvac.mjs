import { loadModel, completion, unloadModel } from '@qvac/sdk';

const schema = `{"action":"hold"|"move","from":string,"to":string,"amount_pct":number,"reason":string}`;

const SYSTEM = `You are Butler, an on-device yield rebalancer. You MUST reply with ONLY a single valid JSON object, no markdown, no prose, no code fences. The JSON must have exactly these keys: action ("hold" or "move"), from (string), to (string), amount_pct (number 0-100), reason (string).`;

const USER = `State: wallet is 100% idle USDC. Venues: Aave V3 USDC supply at 4.2% APY, idle at 0%. Decide a rebalancing action and respond with the JSON object only.`;

async function tryParse(raw) {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function attempt(modelId) {
  const history = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: USER },
  ];
  const t0 = Date.now();
  const result = completion({
    modelId,
    history,
    stream: true,
    temperature: 0,
    maxTokens: 256,
    responseFormat: {
      type: 'json_schema',
      json_schema: {
        name: 'butler_action',
        schema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['hold', 'move'] },
            from: { type: 'string' },
            to: { type: 'string' },
            amount_pct: { type: 'number' },
            reason: { type: 'string' },
          },
          required: ['action', 'from', 'to', 'amount_pct', 'reason'],
          additionalProperties: false,
        },
      },
    },
  });
  let raw = '';
  for await (const token of result.tokenStream) {
    raw += token;
  }
  const elapsed = Date.now() - t0;
  const parsed = await tryParse(raw.trim());
  return { raw, parsed, elapsed };
}

(async () => {
  console.log('Loading model from local file...');
  const tLoad = Date.now();
  const modelId = await loadModel({
    modelSrc: '/Users/h/Documents/crypto butler 2/spikes/model.gguf',
    modelType: 'llamacpp-completion',
    modelConfig: { ctx_size: 2048 },
  });
  console.log('Loaded in', Date.now() - tLoad, 'ms. modelId:', String(modelId).slice(0, 40));

  let parses = 0;
  let schemaOk = 0;
  for (let i = 1; i <= 1; i++) {
    console.log(`\n=== Attempt ${i}/3 ===`);
    const { raw, parsed, elapsed } = await attempt(modelId);
    console.log('Raw output:', JSON.stringify(raw));
    console.log('Time taken:', elapsed, 'ms');
    if (parsed.ok) {
      parses++;
      console.log('Parse result: SUCCESS', JSON.stringify(parsed.value));
      const v = parsed.value || {};
      const valid = (v.action === 'hold' || v.action === 'move')
        && typeof v.from === 'string'
        && typeof v.to === 'string'
        && typeof v.amount_pct === 'number'
        && typeof v.reason === 'string';
      console.log('Schema valid:', valid);
      if (valid) schemaOk++;
    } else {
      console.log('Parse result: FAILED -', parsed.error);
    }
  }
  console.log(`\nParse successes: ${parses}/3 ; schema-valid: ${schemaOk}/3`);
  await unloadModel({ modelId });
  console.log('Unloaded.');
})().catch((e) => {
  console.error('SPIKE ERROR:', e);
  process.exit(1);
});