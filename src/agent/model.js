import { loadModel, completion, unloadModel } from '@qvac/sdk';
import { enumerateCandidates, bestCandidate } from '../core/candidates.js';
import { validate } from '../core/guardrails.js';
import { toProposal } from '../core/actionSchema.js';
import { defaultConfig } from '../core/config.js';

if (!process.env.QVAC_RPC_INIT_TIMEOUT_MS) {
  process.env.QVAC_RPC_INIT_TIMEOUT_MS = '300000';
}
import { resolve } from 'node:path';
const MODEL_PATH = process.env.MODEL_PATH
  ? resolve(process.env.MODEL_PATH)
  : resolve(process.cwd(), 'spikes/model.gguf');

let modelIdPromise = null;
let loadTimeMs = null;

export async function ensureModel() {
  if (!modelIdPromise) {
    const t0 = Date.now();
    modelIdPromise = loadModel({
      modelSrc: MODEL_PATH,
      modelType: 'llamacpp-completion',
      modelConfig: { ctx_size: 2048 },
    }).then((id) => {
      loadTimeMs = Date.now() - t0;
      return id;
    });
  }
  return modelIdPromise;
}

export function getLoadTimeMs() {
  return loadTimeMs;
}

export function fallbackProposal(candidates) {
  const fb = bestCandidate(candidates);
  if (fb && fb.id !== 'hold') {
    return toProposal({
      action: 'move',
      from: fb.from,
      to: fb.to,
      amount_pct: fb.amountPct,
      reason: 'fallback_ranked',
    });
  }
  return toProposal({ action: 'hold', from: 'idle', to: 'idle', amount_pct: 0, reason: 'fallback_ranked' });
}

function buildSchema(candidateIds) {
  return {
    type: 'object',
    properties: {
      choice: { type: 'string', enum: candidateIds },
      reason: { type: 'string' },
    },
    required: ['choice', 'reason'],
    additionalProperties: false,
  };
}

export function mapChoice(choice, reason, candidates) {
  if (choice === 'hold') {
    return toProposal({ action: 'hold', from: 'idle', to: 'idle', amount_pct: 0, reason });
  }
  const c = candidates.find((x) => x.id === choice);
  if (!c) throw new Error(`unknown candidate id: ${choice}`);
  return toProposal({
    action: c.action,
    from: c.from,
    to: c.to,
    amount_pct: c.amountPct,
    reason,
  });
}

function buildPrompt(candidates) {
  const system = [
    'You are Butler, an on-device yield rebalancer.',
    'You must choose exactly one candidate id from the provided list. Every candidate already passes safety guardrails.',
    'Reply with ONLY a JSON object: {"choice": "<id>", "reason": "<short reason>"}. No prose, no markdown.',
  ].join(' ');

  const list = candidates.map((c) => ({
    id: c.id,
    from: c.from,
    to: c.to,
    amount_pct: c.amountPct,
    apy_gain: c.apyGain,
  }));

  const user = `Candidates:\n${JSON.stringify(list, null, 2)}\nChoose one id and explain.`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export async function propose(state, config = defaultConfig) {
  const rawOutputs = [];
  const candidates = enumerateCandidates(state, config);
  const t0 = Date.now();
  const inferStart = Date.now();
  let attempts = 0;
  let proposal = null;
  let inferenceTimeMs = 0;

  for (let i = 0; i < 3; i++) {
    attempts++;
    let raw = '';
    try {
      const modelId = await ensureModel();
      const history = buildPrompt(candidates);
      const result = completion({
        modelId,
        history,
        stream: true,
        temperature: 0,
        maxTokens: 256,
        responseFormat: {
          type: 'json_schema',
          json_schema: { name: 'butler_choice', schema: buildSchema(candidates.map((c) => c.id)) },
        },
      });
      for await (const token of result.tokenStream) raw += token;
      rawOutputs.push(raw);
      const parsed = JSON.parse(raw);
      const choice = parsed && parsed.choice;
      const reason = parsed && typeof parsed.reason === 'string' ? parsed.reason : '';
      const candidate = mapChoice(choice, reason, candidates);

      // final guardrail check
      const verdict = validate(candidate, state, config);
      if (!verdict.ok) throw new Error(`guardrails rejected: ${verdict.violations.join('; ')}`);

      proposal = candidate;
      inferenceTimeMs = Date.now() - inferStart;
      break;
    } catch (err) {
      if (raw && !rawOutputs.includes(raw)) rawOutputs.push(raw);
      if (!raw) rawOutputs.push(`error: ${err && err.message ? err.message : String(err)}`);
    }
  }

  if (!proposal) {
    const fb = bestCandidate(candidates);
    if (fb && fb.id !== 'hold') {
      proposal = toProposal({
        action: 'move',
        from: fb.from,
        to: fb.to,
        amount_pct: fb.amountPct,
        reason: 'fallback_ranked',
      });
      // final check
      const verdict = validate(proposal, state, config);
      if (!verdict.ok) {
        proposal = toProposal({ action: 'hold', from: 'idle', to: 'idle', amount_pct: 0, reason: 'fallback_ranked' });
      }
    } else {
      proposal = toProposal({ action: 'hold', from: 'idle', to: 'idle', amount_pct: 0, reason: 'fallback_ranked' });
    }
    inferenceTimeMs = inferenceTimeMs || Date.now() - inferStart;
  }

  return {
    proposal,
    attempts,
    rawOutputs,
    latencyMs: Date.now() - t0,
    loadTimeMs: getLoadTimeMs(),
    inferenceTimeMs,
    candidates,
  };
}

export async function disposeModel() {
  if (modelIdPromise) {
    try {
      const id = await modelIdPromise;
      await unloadModel({ modelId: id });
    } catch {}
    modelIdPromise = null;
  }
}

export default { ensureModel, propose, disposeModel, getLoadTimeMs };