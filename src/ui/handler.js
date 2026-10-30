import crypto from 'node:crypto';
import fs from 'node:fs';
import { ensureModel, getLoadTimeMs } from '../agent/model.js';
import { runCycle } from '../agent/loop.js';
import { flush } from '../exec/flush.js';
import { createExecutor } from '../exec/executor.js';
import { pending, listAll } from '../exec/queue.js';

function isLocal(req) {
  const host = (req.headers.host || '').replace(/:\d+$/, '');
  const origin = req.headers.origin;
  let originHost = null;
  if (origin) {
    try { originHost = new URL(origin).hostname; } catch { return false; }
  }
  const hostOk = host === 'localhost' || host === '127.0.0.1' || host === '';
  const originOk = !originHost || originHost === 'localhost' || originHost === '127.0.0.1';
  return hostOk && originOk;
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let data = '';
  for await (const chunk of req) data += chunk;
  return data ? JSON.parse(data) : {};
}

export function createHandler(deps = {}) {
  const ensureModelFn = deps.ensureModel || ensureModel;
  const getLoadTimeMsFn = deps.getLoadTimeMs || getLoadTimeMs;
  const runCycleFn = deps.runCycle || runCycle;
  const flushFn = deps.flush || flush;
  const createExecutorFn = deps.createExecutor || createExecutor;
  const pendingFn = deps.pending || pending;
  const listAllFn = deps.listAll || listAll;

  let modelReady = false;
  ensureModelFn().then(() => { modelReady = true; if (!deps.quiet) console.log('model ready'); }).catch((e) => {
    if (!deps.quiet) console.error('model load failed:', e && e.message ? e.message : e);
  });

  let busy = false;
  const jobs = new Map();
  const held = new Map();

  return async function handler(req, res) {
    if (!isLocal(req)) {
      return json(res, 403, { error: 'forbidden: localhost only' });
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const p = url.pathname;

    if (req.method === 'GET' && p === '/api/status') {
      return json(res, 200, { modelReady, busy, queueCount: pendingFn().length, loadTimeMs: getLoadTimeMsFn() });
    }

    if (req.method === 'GET' && p === '/api/queue') {
      return json(res, 200, pendingFn());
    }

    if (req.method === 'GET' && p === '/api/journal') {
      const file = (deps.journalPath) || 'data/journal.jsonl';
      let lines = [];
      try {
        const raw = (deps.readFile || fs.readFileSync)(file, 'utf8');
        lines = raw.split('\n').filter(Boolean).map((l) => JSON.parse(l));
      } catch {}
      return json(res, 200, lines);
    }

    const jobMatch = p.match(/^\/api\/job\/([a-f0-9-]+)$/);
    if (req.method === 'GET' && jobMatch) {
      const job = jobs.get(jobMatch[1]);
      if (!job) return json(res, 404, { error: 'job not found' });
      return json(res, 200, job);
    }

    if (req.method === 'POST' && p === '/api/cycle') {
      if (busy) return json(res, 409, { error: 'a cycle is already running' });
      let body;
      try { body = await readBody(req); } catch { return json(res, 400, { error: 'invalid json' }); }
      const source = body.source || 'idle-opportunity';
      const jobId = crypto.randomUUID();
      jobs.set(jobId, { id: jobId, status: 'running', source, createdAt: new Date().toISOString() });
      busy = true;
      (async () => {
        try {
          const result = await runCycleFn(source);
          const proposalId = crypto.randomUUID();
          held.set(proposalId, { proposal: result.proposal, state: result.state });
          jobs.set(jobId, { ...result, status: 'completed', proposalId, proposalId });
        } catch (e) {
          jobs.set(jobId, { id: jobId, status: 'failed', error: String(e && e.message ? e.message : e) });
        } finally {
          busy = false;
        }
      })();
      return json(res, 202, { jobId });
    }

    if (req.method === 'POST' && p === '/api/approve') {
      let body;
      try { body = await readBody(req); } catch { return json(res, 400, { error: 'invalid json' }); }
      const proposalId = body.proposalId;
      const heldEntry = held.get(proposalId);
      if (!heldEntry) return json(res, 400, { error: 'unknown proposal id' });
      const kind = body.executor || 'mock';
      const executor = (kind === 'live' || kind === 'router') ? (await import('../exec/router.js')).createRouter({}) : createExecutorFn(kind);
      // Always use mock unless explicitly live; default mock.
      const finalExecutor = kind === 'mock' ? createExecutorFn('mock') : executor;
      const { enqueue } = await import('../exec/queue.js');
      // For UI we queue offline (no blocking exec); online execution runs through run.js.
      const amount = heldEntry.state?.balances?.usdc ?? 0n;
      const intent = enqueue(heldEntry.proposal, { amountUsdc: String(amount) });
      held.delete(proposalId);
      return json(res, 200, { status: 'queued', intentId: intent.id });
    }

    if (req.method === 'POST' && p === '/api/reject') {
      let body;
      try { body = await readBody(req); } catch { return json(res, 400, { error: 'invalid json' }); }
      held.delete(body.proposalId);
      return json(res, 200, { status: 'rejected' });
    }

    if (req.method === 'POST' && p === '/api/flush') {
      let body;
      try { body = await readBody(req); } catch { return json(res, 400, { error: 'invalid json' }); }
      const kind = body.executor || 'mock';
      const source = body.source || 'idle-opportunity';
      const { observe } = await import('../agent/observe.js');
      const observeFn = async () => observe(source);
      const executor = (kind === 'live' || kind === 'router')
        ? (await import('../exec/router.js')).createRouter({})
        : createExecutorFn(kind);
      const results = await flushFn(executor, observeFn);
      return json(res, 200, results);
    }

    return json(res, 404, { error: 'not found' });
  };
}
