/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { jsonLogger, redactForLog, GitlabVisibility } from '@lens/services';
import { db, dbReachable, makeEnv, type Env } from '../helpers/services';

describe('structured logging', () => {
  it('writes one JSON object per line and redacts secret-looking keys and values', () => {
    const lines: string[] = [];
    const log = jsonLogger((l) => lines.push(l), { service: 't' });
    log.log('info', 'sync with glpat-ABCDEFGH12345678', { token: 'x', nested: { apiKey: 'k', ok: 1, header: 'Bearer abcdefghijklmnopqrstuvwx' }, prompt: 'SECRET PROMPT', err: new Error('failed for sk-ant-abcdefghij1234') });
    const o = JSON.parse(lines[0]!);
    expect(o).toMatchObject({ level: 'info', service: 't', token: '[redacted]', prompt: '[redacted]', nested: { apiKey: '[redacted]', ok: 1 } });
    expect(lines[0]).not.toMatch(/glpat-ABCDEFGH|sk-ant-abcdefghij|SECRET PROMPT|abcdefghijklmnopqrstuvwx/);
    expect(o.time).toMatch(/^\d{4}-/);
  });
  it('redaction handles cycles by depth limit and non-objects', () => {
    const a: any = { k: 1 }; a.self = a;
    expect(() => redactForLog(a)).not.toThrow();
    expect(redactForLog(5)).toBe(5); expect(redactForLog(null)).toBeNull();
  });
});

describe.skipIf(!dbReachable)('GitLab visibility checker (real accounts table)', () => {
  let env: Env; let userId: string;
  beforeAll(async () => { env = await makeEnv(); userId = (await env.user('VIEWER', { gitlab: false })).id; });
  afterAll(async () => { await env.cleanup(); await db!.$disconnect(); });
  const acct = (over: any = {}) => db!.account.create({ data: { userId, type: 'oauth', provider: 'gitlab', providerAccountId: `${env.tag}-${Math.random()}`, access_token: 'tok1', refresh_token: 'ref1', ...over } });

  it('says no when the user has no GitLab account or token', async () => {
    const v = new GitlabVisibility(db!, { baseUrl: 'https://gl', fetch: (async () => new Response('{}', { status: 200 })) as any });
    expect(await v.canRead(userId, 5)).toBe(false);
  });
  it('uses the user\'s own token (never a service token) and treats 200 as readable, 404 as not', async () => {
    const a = await acct();
    const seen: string[] = [];
    const f = (async (url: string, init: any) => { seen.push(`${url}|${init.headers.authorization}`); return new Response('{}', { status: url.endsWith('/projects/5') ? 200 : 404 }); }) as any;
    const v = new GitlabVisibility(db!, { baseUrl: 'https://gl/', fetch: f });
    expect(await v.canRead(userId, 5)).toBe(true);
    expect(await v.canRead(userId, 6)).toBe(false);
    expect(seen[0]).toBe('https://gl/api/v4/projects/5|Bearer tok1');
    await db!.account.delete({ where: { id: a.id } });
  });
  it('refreshes an expired token once, stores the new one, and retries', async () => {
    const a = await acct();
    const calls: string[] = [];
    const f = (async (url: string, init: any) => {
      calls.push(url);
      if (url.endsWith('/oauth/token')) { expect(String(init.body)).toContain('refresh_token=ref1'); return new Response(JSON.stringify({ access_token: 'tok2', refresh_token: 'ref2', created_at: 100, expires_in: 7200 }), { status: 200 }); }
      return new Response('{}', { status: init.headers.authorization === 'Bearer tok2' ? 200 : 401 });
    }) as any;
    const v = new GitlabVisibility(db!, { baseUrl: 'https://gl', clientId: 'cid', clientSecret: 'sec', fetch: f });
    expect(await v.canRead(userId, 5)).toBe(true);
    const row = await db!.account.findUnique({ where: { id: a.id } });
    expect(row).toMatchObject({ access_token: 'tok2', refresh_token: 'ref2', expires_at: 7300 });
    expect(calls.filter((c) => c.endsWith('/oauth/token'))).toHaveLength(1);
    await db!.account.delete({ where: { id: a.id } });
  });
  it('a failed refresh means no access (no infinite retry)', async () => {
    const a = await acct();
    const f = (async (url: string) => new Response('{}', { status: url.endsWith('/oauth/token') ? 400 : 401 })) as any;
    const v = new GitlabVisibility(db!, { baseUrl: 'https://gl', clientId: 'cid', clientSecret: 'sec', fetch: f });
    expect(await v.canRead(userId, 5)).toBe(false);
    await db!.account.delete({ where: { id: a.id } });
  });
});
