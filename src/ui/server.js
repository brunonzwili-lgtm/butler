import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCycle } from '../agent/loop.js';
import { flush } from '../exec/flush.js';
import { createExecutor } from '../exec/executor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.PORT || 3000);

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'content-type': type });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

async function readJson(req) {
  let data = '';
  for await (const chunk of req) data += chunk;
  return data ? JSON.parse(data) : {};
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
    return send(res, 200, html, 'text/html');
  }
  if (req.url === '/api/yields') {
    const y = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'yields.json'), 'utf8'));
    return send(res, 200, y);
  }
  if (req.url === '/api/cycle' && req.method === 'POST') {
    try {
      const body = await readJson(req);
      console.log('model thinking...');
      const r = await runCycle(body.source || 'idle-opportunity');
      return send(res, 200, r);
    } catch (e) {
      return send(res, 500, { error: String(e && e.message ? e.message : e) });
    }
  }
  if (req.url === '/api/flush' && req.method === 'POST') {
    try {
      const body = await readJson(req);
      const kind = body.executor || 'mock';
      const source = body.source || 'idle-opportunity';
      const { observe } = await import('../agent/observe.js');
      const observeFn = async () => observe(source);
      const ex = (kind === 'live' || kind === 'router')
        ? (await import('../exec/router.js')).createRouter({})
        : createExecutor(kind);
      const results = await flush(ex, observeFn);
      return send(res, 200, results);
    } catch (e) {
      return send(res, 500, { error: String(e && e.message ? e.message : e) });
    }
  }
  send(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`Butler UI: http://localhost:${PORT}`);
});