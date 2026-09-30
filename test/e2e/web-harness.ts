/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import type { Role } from '@lens/core';
import { hashPassword, runImport, createProject, startAnalysis, runAnalysisJob, type Actor } from '@lens/services';
import { db, makeEnv, scriptedModel, modelText, exampleAnalysisJson, type Env } from '../helpers/services';
import { exampleRequest } from '../helpers/example';

export const CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
export const WEB_DIR = path.resolve(__dirname, '../../apps/web');
export const built = () => fs.existsSync(path.join(WEB_DIR, '.next/BUILD_ID'));
export const BREAK_GLASS_PASSWORD = 'e2e-break-glass-pw';

export interface Web {
  url: string; env: Env; source: { id: string; gitlabProjectId: number };
  cookie(role: Role | 'outsider'): { name: string; value: string; url: string };
  actors: Record<Role, Actor>;
  projectId: string; aiAnalysisId: string;
  stop(): Promise<void>;
  log(): string;
}

const fixture = (n: string) => fs.readFileSync(path.resolve(__dirname, '../fixtures/bafoz/exports', n), 'utf8');

export async function startWeb(): Promise<Web> {
  const env = await makeEnv();
  const src = await env.source({ name: `${env.tag}-NB` });
  await env.syncNow(src.id);

  // fake GitLab: answers "can this token read project N?" (the app's real visibility checker talks to it over HTTP)
  const allowed = new Map<string, Set<number>>();
  const gl = http.createServer((req, res) => {
    const m = req.url?.match(/^\/api\/v4\/projects\/(\d+)$/);
    const tok = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
    if (m && allowed.get(tok)?.has(Number(m[1]))) { res.writeHead(200, { 'content-type': 'application/json' }).end('{}'); return; }
    res.writeHead(m ? 404 : 401).end('{}');
  });
  await new Promise<void>((r) => gl.listen(0, '127.0.0.1', r));
  const glPort = (gl.address() as any).port as number;

  const roles: (Role | 'outsider')[] = ['VIEWER', 'CONTRIBUTOR', 'MAINTAINER', 'ADMIN', 'outsider'];
  const sessions = new Map<string, string>();
  const actors = {} as Record<Role, Actor>;
  for (const r of roles) {
    const role: Role = r === 'outsider' ? 'ADMIN' : r;
    const a = await env.user(role, { gitlab: false });
    const token = `tok-${r}-${env.tag}`;
    if (r !== 'outsider') { allowed.set(token, new Set([src.gitlabProjectId])); actors[role] = a; env.vis.grant(a.id, src.gitlabProjectId); } // the test process's own services use the in-memory checker; the web server uses the fake GitLab over HTTP
    await db!.account.create({ data: { userId: a.id, type: 'oidc', provider: 'gitlab', providerAccountId: `${r}-${env.tag}`, access_token: token } });
    const st = randomBytes(24).toString('base64url');
    await db!.session.create({ data: { sessionToken: st, userId: a.id, expires: new Date(Date.now() + 8 * 3600_000) } });
    sessions.set(r, st);
  }

  // history for the source: tickets and incidents, then one AI-analysed project so the full results page can be tested
  await runImport(env.ctx, actors.MAINTAINER, src.id, 'tickets', fixture('jira-taskmanager-tickets.csv'), { key: 'id', title: 'title', taskmanager: 'tm', type: 'type', status: 'status', note: 'tm_note', reqs: 'reqs', commit: 'commit' });
  await runImport(env.ctx, actors.MAINTAINER, src.id, 'incidents', fixture('incidents.csv'), { key: 'id', title: 'title', files: 'files', severity: 'sev', rootCause: 'root', reqs: 'reqs', fixTicket: 'fix', status: 'status', residual: 'residual', symptom: 'symptom', date: 'date' });
  await db!.source.update({ where: { id: src.id }, data: { aiAllowed: true } });
  env.ctx.ai = { apiKey: 'x', model: 'scripted', provider: 'anthropic', baseUrl: 'http://unused' };
  env.model.current = scriptedModel([() => modelText(exampleAnalysisJson())]);
  const project = await createProject(env.ctx, actors.CONTRIBUTOR, { name: 'Last-day debit order collections', description: exampleRequest(), sourceId: src.id });
  await db!.changeProject.update({ where: { id: project.id }, data: { isExample: true } });
  const a = await startAnalysis(env.ctx, actors.CONTRIBUTOR, project.id);
  await runAnalysisJob(env.ctx, a.analysisId);
  env.ctx.ai = null; env.model.current = null;
  await db!.source.update({ where: { id: src.id }, data: { aiAllowed: false } });

  const port = 3100 + Math.floor(Math.random() * 800);
  const url = `http://127.0.0.1:${port}`;
  let out = '';
  // run Next directly (not through npx) so that stop() terminates the server itself
  const nextBin = path.resolve(__dirname, '../../node_modules/next/dist/bin/next');
  const child: ChildProcess = spawn(process.execPath, [nextBin, 'start', '-p', String(port), '-H', '127.0.0.1'], {
    cwd: WEB_DIR, stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env, NODE_ENV: 'production', DATABASE_URL: `${process.env.DATABASE_URL!}${process.env.DATABASE_URL!.includes('?') ? '&' : '?'}connection_limit=6`, AUTH_SECRET: 'e2e-secret-0123456789abcdef0123456789', AUTH_URL: url, AUTH_TRUST_HOST: 'true',
      GITLAB_BASE_URL: `http://127.0.0.1:${glPort}`, GITLAB_CLIENT_ID: 'x', GITLAB_CLIENT_SECRET: 'y', LENS_ENCRYPTION_KEYS: `k1:${randomBytes(32).toString('base64')}`,
      LENS_BREAK_GLASS_HASH: hashPassword(BREAK_GLASS_PASSWORD), NEXT_TELEMETRY_DISABLED: '1',
    },
  });
  child.stdout?.on('data', (d) => (out += d)); child.stderr?.on('data', (d) => (out += d));
  const t0 = Date.now();
  for (;;) {
    try { const r = await fetch(`${url}/api/health`); if (r.ok) break; } catch { /* not up yet */ }
    if (Date.now() - t0 > 60_000) { child.kill(); throw new Error(`web did not start:\n${out}`); }
    await new Promise((r) => setTimeout(r, 300));
  }
  return {
    url, env, source: src, actors, projectId: project.id, aiAnalysisId: a.analysisId,
    cookie: (r) => ({ name: 'authjs.session-token', value: sessions.get(r)!, url }),
    async stop() { child.kill('SIGTERM'); await new Promise<void>((r) => { child.once('exit', () => r()); setTimeout(r, 5000); }); await new Promise<void>((r) => gl.close(() => r())); await db!.session.deleteMany({ where: { user: { email: { startsWith: env.tag } } } }); await db!.account.deleteMany({ where: { user: { email: { startsWith: env.tag } } } }); await db!.auditLog.deleteMany({ where: { targetType: 'break-glass' } }); await env.cleanup(); },
    log: () => out,
  };
}
