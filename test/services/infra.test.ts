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

import { hashPassword, verifyPassword, breakGlassLogin, rateLimited, resetRateLimit, BREAK_GLASS_EMAIL, breakGlassEnabled } from '@lens/services';

describe('break-glass admin', () => {
  it('hashes with scrypt and verifies in constant time; rejects malformed hashes', () => {
    const h = hashPassword('correct horse');
    expect(h).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(hashPassword('correct horse')).not.toBe(h); // salted
    expect(verifyPassword('correct horse', h)).toBe(true);
    expect(verifyPassword('wrong', h)).toBe(false);
    expect(verifyPassword('x', 'plaintext')).toBe(false);
  });
  it('limits attempts per client', () => {
    resetRateLimit();
    const r = Array.from({ length: 7 }, () => rateLimited('1.2.3.4', 1000));
    expect(r).toEqual([false, false, false, false, false, true, true]);
    expect(rateLimited('5.6.7.8', 1000)).toBe(false);
    expect(rateLimited('1.2.3.4', 1000 + 61_000)).toBe(false); // window passed
    resetRateLimit();
  });
  it('is disabled by default', () => { expect(breakGlassEnabled({})).toBe(false); expect(breakGlassEnabled({ LENS_BREAK_GLASS_HASH: 'x' })).toBe(true); });
  describe.skipIf(!dbReachable)('with a database', () => {
    let env: Env;
    beforeAll(async () => { env = await makeEnv(); });
    afterAll(async () => { await db!.session.deleteMany({ where: { user: { email: BREAK_GLASS_EMAIL } } }); await db!.auditLog.deleteMany({ where: { targetType: 'break-glass' } }); await env.cleanup(); await db!.$disconnect(); });
    it('returns null when not configured, even with the "right" password', async () => {
      expect(await breakGlassLogin(env.ctx, 'pw', 'ip-a')).toBeNull();
    });
    it('creates an 8-hour admin session on the right password, and audits every attempt without the password', async () => {
      resetRateLimit();
      const ctx = { ...env.ctx, env: { ...env.ctx.env, LENS_BREAK_GLASS_HASH: hashPassword('s3cret-pass') } };
      expect(await breakGlassLogin(ctx, 'nope', 'ip-b')).toBeNull();
      const ok = await breakGlassLogin(ctx, 's3cret-pass', 'ip-b');
      expect(ok!.token.length).toBeGreaterThan(30);
      expect(ok!.expires.getTime() - Date.now()).toBeGreaterThan(7.9 * 3600_000);
      const s = await db!.session.findUnique({ where: { sessionToken: ok!.token }, include: { user: true } });
      expect(s!.user).toMatchObject({ email: BREAK_GLASS_EMAIL, role: 'ADMIN' });
      const logs = await db!.auditLog.findMany({ where: { targetType: 'break-glass' } });
      expect(logs.length).toBeGreaterThanOrEqual(2);
      expect(JSON.stringify(logs)).not.toMatch(/s3cret|nope/);
      resetRateLimit();
    });
    it('locks out after repeated failures, even for the right password', async () => {
      resetRateLimit();
      const ctx = { ...env.ctx, env: { ...env.ctx.env, LENS_BREAK_GLASS_HASH: hashPassword('pw-lock') } };
      for (let i = 0; i < 5; i++) await breakGlassLogin(ctx, 'bad', 'ip-c');
      expect(await breakGlassLogin(ctx, 'pw-lock', 'ip-c')).toBeNull();
      resetRateLimit();
    });
  });
});
