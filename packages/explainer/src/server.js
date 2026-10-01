// Zero-dependency HTTP server: the generator API, the embeddable web component, and the demo pages.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createExplainer, PACKAGE_DIR } from './index.js';
import { ExplainerError } from './generate.js';
import { normalizeSpec } from './spec.js';
import { renderHtml } from './render.js';
import { timingSafeEqual } from 'node:crypto';

const MAX_BODY = 64 * 1024;
const file = (p) => readFileSync(join(PACKAGE_DIR, p));

function readJson(req) {
  return new Promise((resolve, reject) => {
    let n = 0, big = false; const parts = [];
    req.on('data', (c) => { n += c.length; if (n > MAX_BODY) big = true; else parts.push(c); });
    req.on('end', () => { if (big) return reject(new ExplainerError('Request body too large.', { status: 413, code: 'too_large' })); try { resolve(parts.length ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {}); } catch { reject(new ExplainerError('Body must be JSON.', { code: 'bad_json' })); } });
    req.on('error', reject);
  });
}
const safeEq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

export async function startServer({ env = process.env, port = Number(env.EXPLAINER_PORT || env.PORT) || 8787, host = env.EXPLAINER_HOST || (env.PORT ? '0.0.0.0' : '127.0.0.1'), ...overrides } = {}) {
  const app = await createExplainer({ env, ...overrides });
  const allowed = (env.EXPLAINER_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const apiKey = env.EXPLAINER_API_KEY || '';
  const rate = new Map(); let active = 0;
  const limitPerMin = Number(env.EXPLAINER_RATE_PER_MIN) || 12, maxActive = Number(env.EXPLAINER_MAX_CONCURRENT) || 3;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x'), origin = req.headers.origin;
    const sameOrigin = !origin || origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`;
    const cors = origin && (allowed.includes('*') || allowed.includes(origin));
    if (cors) { res.setHeader('access-control-allow-origin', origin); res.setHeader('vary', 'origin'); res.setHeader('access-control-allow-headers', 'content-type, authorization'); res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS'); }
    res.setHeader('x-content-type-options', 'nosniff');
    const send = (status, body, type = 'application/json; charset=utf-8', extra = {}) => { res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...extra }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
    const fail = (e) => { const status = e.status || 500; if (!res.headersSent) send(status, { error: { code: e.code || 'error', message: status === 500 ? 'Something went wrong.' : e.message, details: e.details } }); else res.end(); if (status === 500) console.error(e); };
    try {
      if (req.method === 'OPTIONS') return send(204, '');
      // static pages and the embed script are public; everything under /api is checked
      if (req.method === 'GET' && url.pathname === '/healthz') return send(200, { ok: true });
      if (req.method === 'GET' && url.pathname === '/embed.js') return send(200, file('public/embed.js'), 'text/javascript; charset=utf-8', { 'cache-control': 'public, max-age=300', 'access-control-allow-origin': '*' });
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/demo')) return send(200, file('demo/host-app.html'), 'text/html; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/tool') return send(200, file('demo/tool.html'), 'text/html; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/demo/requirements.json') return send(200, file('demo/requirements.json'));
      if (!url.pathname.startsWith('/api/')) return send(404, { error: { code: 'not_found', message: 'Not found.' } });

      if (origin && !sameOrigin && !cors) return send(403, { error: { code: 'origin_not_allowed', message: 'This origin is not allowed. Add it to EXPLAINER_ALLOWED_ORIGINS.' } });
      if (apiKey) { const got = (req.headers.authorization || '').replace(/^Bearer\s+/i, ''); if (!safeEq(got, apiKey)) return send(401, { error: { code: 'unauthorized', message: 'Missing or wrong API key.' } }); }

      if (req.method === 'GET' && url.pathname === '/api/health') return send(200, { ok: true, provider: app.provider.name, model: app.provider.model, indexed: await app.store.count(), processes: app.catalog.processes.length, processErrors: app.processErrors });
      if (req.method === 'GET' && url.pathname === '/api/processes') return send(200, app.catalog.processes.map((p) => ({ id: p.id, name: p.name, summary: p.summary, steps: p.steps.length })));
      if (req.method === 'GET' && url.pathname === '/api/search') {
        const hits = await app.explainer.retrieve(url.searchParams.get('q') || '');
        return send(200, hits.map((h) => ({ score: +h.score.toFixed(3), path: h.meta.path, startLine: h.meta.startLine, endLine: h.meta.endLine })));
      }
      if (req.method === 'POST' && url.pathname === '/api/render') {
        const body = await readJson(req), n = normalizeSpec(body.spec);
        if (!n.ok) throw new ExplainerError(`Invalid spec: ${n.errors.slice(0, 3).join('; ')}`, { code: 'invalid_spec', details: n.errors });
        return send(200, { spec: n.spec, html: renderHtml(n.spec, { theme: body.theme, header: body.header }), warnings: n.warnings });
      }
      if (req.method === 'POST' && url.pathname === '/api/explain') {
        const ip = req.socket.remoteAddress || '?', now = Date.now(), win = (rate.get(ip) || []).filter((t) => t > now - 60000);
        if (win.length >= limitPerMin) return send(429, { error: { code: 'rate_limited', message: 'Too many requests. Try again in a minute.' } }, undefined, { 'retry-after': '60' });
        if (active >= maxActive) return send(429, { error: { code: 'busy', message: 'The generator is busy. Try again shortly.' } }, undefined, { 'retry-after': '10' });
        win.push(now); rate.set(ip, win);
        const body = await readJson(req), ac = new AbortController();
        res.on('close', () => { if (!res.writableEnded) ac.abort(); });
        active++;
        try {
          if ((req.headers.accept || '').includes('text/event-stream')) {
            res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
            const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
            let lastProgress = 0;
            try {
              const out = await app.explainer.explain(body, (e) => { if (e.type === 'progress') { if (Date.now() - lastProgress < 400) return; lastProgress = Date.now(); } ev(e.type, e); }, ac.signal);
              ev('result', out);
            } catch (e) { ev('error', { code: e.code || 'error', message: (e.status && e.status !== 500) || e instanceof ExplainerError ? e.message : (e.code ? e.message : 'Something went wrong.') }); if (!e.code) console.error(e); }
            return res.end();
          }
          return send(200, await app.explainer.explain(body, () => {}, ac.signal));
        } finally { active--; }
      }
      return send(404, { error: { code: 'not_found', message: 'Not found.' } });
    } catch (e) { fail(e); }
  });
  await new Promise((r) => server.listen(port, host, r));
  return { server, app, port: server.address().port, close: () => new Promise((r) => server.close(r)) };
}
