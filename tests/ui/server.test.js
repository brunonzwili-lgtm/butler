import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHandler } from '../../src/ui/handler.js';

function request(server, method, path, body) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const opts = { hostname: '127.0.0.1', port: addr.port, path, method, headers: { 'content-type': 'application/json', host: 'localhost' } };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

test('status endpoint works', async () => {
  const handler = createHandler({ ensureModel: async () => {}, getLoadTimeMs: () => 0, runCycle: async () => ({ status: 'ok' }), flush: async () => [], createExecutor: () => ({}), pending: () => [], listAll: () => [], quiet: true });
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const r = await request(server, 'GET', '/api/status');
  assert.equal(r.status, 200);
  assert.equal(r.body.modelReady, true);
  server.close();
});

test('bad host rejected', async () => {
  const handler = createHandler({ ensureModel: async () => {}, getLoadTimeMs: () => 0, runCycle: async () => ({}), flush: async () => [], createExecutor: () => ({}), pending: () => [], listAll: () => [], quiet: true });
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  const res = await new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: addr.port, path: '/api/status', method: 'GET', headers: { host: 'evil.com' } }, (r) => {
      let d=''; r.on('data',c=>d+=c); r.on('end',()=>resolve({status:r.statusCode}));
    });
    req.on('error', reject);
    req.end();
  });
  assert.equal(res.status, 403);
  server.close();
});

test('cycle returns job id and completes', async () => {
  const handler = createHandler({ ensureModel: async () => {}, getLoadTimeMs: () => 0, runCycle: async (src) => ({ source: src, verdict: 'approved' }), flush: async () => [], createExecutor: () => ({}), pending: () => [], listAll: () => [], quiet: true });
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const started = await request(server, 'POST', '/api/cycle', { source: 'idle-opportunity' });
  assert.equal(started.status, 202);
  assert.ok(started.body.jobId);
  // poll
  let job;
  for (let i = 0; i < 20; i++) {
    const r = await request(server, 'GET', `/api/job/${started.body.jobId}`);
    job = r.body;
    if (job.status === 'completed') break;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.equal(job.status, 'completed');
  assert.equal(job.verdict, 'approved');
  server.close();
});

test('approve requires known proposal id', async () => {
  const handler = createHandler({ ensureModel: async () => {}, getLoadTimeMs: () => 0, runCycle: async () => ({ proposal: { action: 'hold' }, verdict: 'approved', state: {} }), flush: async () => [], createExecutor: () => ({}), pending: () => [], listAll: () => [], quiet: true });
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const started = await request(server, 'POST', '/api/cycle', { source: 'idle-opportunity' });
  const jobId = started.body.jobId;
  let proposalId;
  for (let i = 0; i < 20; i++) {
    const r = await request(server, 'GET', `/api/job/${jobId}`);
    if (r.body.proposalId) { proposalId = r.body.proposalId; break; }
    await new Promise((r) => setTimeout(r, 10));
  }
  const ok = await request(server, 'POST', '/api/approve', { proposalId });
  assert.equal(ok.status, 200);
  const bad = await request(server, 'POST', '/api/approve', { proposalId: 'nope' });
  assert.equal(bad.status, 400);
  server.close();
});