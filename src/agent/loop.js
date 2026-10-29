import { observe } from './observe.js';
import { propose as defaultPropose } from './model.js';
import { validate } from '../core/guardrails.js';
import { defaultConfig } from '../core/config.js';
import { appendJournal } from './journal.js';

export async function runCycle(source = 'idle-opportunity', options = {}) {
  const config = options.config || defaultConfig;
  const proposeFn = options.propose || defaultPropose;

  const state = await observe(source, options);
  const { proposal, attempts, rawOutputs, latencyMs, loadTimeMs, inferenceTimeMs, candidates } = await proposeFn(state, config);

  const verdictResult = validate(proposal, state, config);
  const verdict = verdictResult.ok ? 'approved' : 'blocked';

  const result = {
    source,
    state,
    proposal,
    verdict,
    violations: verdictResult.violations,
    attempts,
    rawOutputs,
    latencyMs,
    loadTimeMs,
    inferenceTimeMs,
    candidates,
  };

  appendJournal(result);
  return result;
}

export default { runCycle };