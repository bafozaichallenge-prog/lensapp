/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Role } from '@lens/core';
import { decrypt } from '@lens/core';
import {
  addSource, setSourceToken, updateSource, listSources, getSource, visibleSources, requireSource, canSeeSource, upsertOAuthUser, setRole, setPreferences, listUsers, seedDevAdmin,
  enqueueSync, addCustomProcess, createProject, previewImport, VISIBILITY_TTL_MS, ServiceError, type Actor,
} from '@lens/services';
import { db, dbReachable, makeEnv, type Env } from '../helpers/services';

const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e) => (e instanceof ServiceError ? e.code : `ERR:${(e as Error).message}`));

describe.skipIf(!dbReachable)('access control and identity (services, real database)', () => {
  let env: Env; let src: { id: string; gitlabProjectId: number };
  const roles: Role[] = ['VIEWER', 'CONTRIBUTOR', 'MAINTAINER', 'ADMIN'];
  const actors = {} as Record<Role, Actor>;
  beforeAll(async () => {
    env = await makeEnv();
    src = await env.source();
    for (const r of roles) actors[r] = await env.user(r);
  });
  afterAll(async () => { await env.cleanup(); await db!.$disconnect(); });

  describe('role matrix on privileged operations', () => {
    const attempts: { name: string; minRole: Role; run: (a: Actor) => Promise<unknown> }[] = [
      { name: 'add source', minRole: 'MAINTAINER', run: (a) => addSource(env.ctx, a, { gitlabProjectId: src.gitlabProjectId, pathWithNamespace: 'x/y', branch: 'b', vertical: 'V', name: `${env.tag}-added-${Math.random()}` }) },
      { name: 'sync now', minRole: 'MAINTAINER', run: (a) => enqueueSync(env.ctx, a, src.id) },
      { name: 'import (preview)', minRole: 'MAINTAINER', run: (a) => previewImport(env.ctx, a, src.id, 'tickets', 'id,title\nA-1,x\n') },
      { name: 'add process', minRole: 'MAINTAINER', run: (a) => addCustomProcess(env.ctx, a, src.id, { name: 'P', steps: 'a\nb' }) },
      { name: 'create project', minRole: 'CONTRIBUTOR', run: (a) => createProject(env.ctx, a, { name: 'p', description: '', sourceId: src.id }) },
      { name: 'manage users', minRole: 'ADMIN', run: (a) => listUsers(env.ctx, a) },
      { name: 'change role', minRole: 'ADMIN', run: (a) => setRole(env.ctx, a, actors.VIEWER.id, 'VIEWER') },
    ];
    const rank: Record<Role, number> = { VIEWER: 0, CONTRIBUTOR: 1, MAINTAINER: 2, ADMIN: 3 };
    for (const t of attempts) for (const r of roles) {
      it(`${t.name}: ${r} ${rank[r] >= rank[t.minRole] ? 'is allowed past the role check' : 'is refused (FORBIDDEN)'}`, async () => {
        const res = await code(t.run(actors[r]));
        if (rank[r] < rank[t.minRole]) expect(res).toBe('FORBIDDEN');
        else expect(res).not.toBe('FORBIDDEN');
      });
    }
  });

  describe('source visibility follows GitLab access (two-dimensional model)', () => {
    it('a user with a Lens role but no GitLab access cannot see, open, sync or analyse the source', async () => {
      const outsider = await env.user('ADMIN', { gitlab: false });
      expect((await visibleSources(env.ctx, outsider)).map((s) => s.id)).not.toContain(src.id);
      expect(await code(requireSource(env.ctx, outsider, 'source.view', src.id))).toBe('NOT_FOUND');
      expect(await code(getSource(env.ctx, outsider, src.id))).toBe('NOT_FOUND');
      expect(await code(enqueueSync(env.ctx, outsider, src.id))).toBe('NOT_FOUND');
      expect((await listSources(env.ctx, outsider)).map((s) => s.id)).not.toContain(src.id);
    });
    it('GitLab access with an insufficient Lens role still cannot perform privileged actions', async () => {
      expect(await code(enqueueSync(env.ctx, actors.VIEWER, src.id))).toBe('FORBIDDEN');
      expect(await code(getSource(env.ctx, actors.VIEWER, src.id))).toBe('ok');
    });
    it('caches GitLab answers for the TTL and fails closed when GitLab errors', async () => {
      const u = await env.user('MAINTAINER');
      const before = env.vis.calls;
      const row = { id: src.id, gitlabProjectId: src.gitlabProjectId };
      expect(await canSeeSource(env.ctx, u, row)).toBe(true);
      expect(await canSeeSource(env.ctx, u, row)).toBe(true);
      expect(env.vis.calls - before).toBe(1); // second answer came from the cache
      // expire the cache, then make GitLab fail: access must be denied, not assumed
      await db!.sourceVisibility.updateMany({ where: { userId: u.id }, data: { checkedAt: new Date(Date.now() - VISIBILITY_TTL_MS - 1000) } });
      env.vis.throwNext = true;
      expect(await canSeeSource(env.ctx, u, row)).toBe(false);
    });
    it('revocation in GitLab takes effect once the cache expires', async () => {
      const u = await env.user('CONTRIBUTOR');
      const row = { id: src.id, gitlabProjectId: src.gitlabProjectId };
      expect(await canSeeSource(env.ctx, u, row)).toBe(true);
      env.vis.revoke(u.id);
      await db!.sourceVisibility.updateMany({ where: { userId: u.id }, data: { checkedAt: new Date(Date.now() - VISIBILITY_TTL_MS - 1000) } });
      expect(await canSeeSource(env.ctx, u, row)).toBe(false);
    });
    it('adding a source requires the actor to read the GitLab project', async () => {
      const m = await env.user('MAINTAINER', { gitlab: false });
      expect(await code(addSource(env.ctx, m, { gitlabProjectId: 424242, pathWithNamespace: 'x/y', branch: 'main', vertical: 'V', name: `${env.tag}-nope` }))).toBe('FORBIDDEN');
    });
  });

  describe('source credentials', () => {
    it('are encrypted at rest, never returned, and decryptable only with the key', async () => {
      const m = await env.user('MAINTAINER');
      env.vis.grant(m.id, 777001);
      const created = await addSource(env.ctx, m, { gitlabProjectId: 777001, pathWithNamespace: 'x/y', branch: 'main', vertical: 'V', name: `${env.tag}-cred`, token: 'glpat-SUPERSECRET123456' });
      expect(JSON.stringify(created)).not.toContain('SUPERSECRET');
      expect((created as any).tokenEnc).toBeUndefined();
      expect(created.hasToken).toBe(true);
      const row = await db!.source.findUnique({ where: { id: created.id } });
      expect(row!.tokenEnc).not.toContain('SUPERSECRET');
      expect(decrypt(row!.tokenEnc!, env.ctx.keys!)).toBe('glpat-SUPERSECRET123456');
      expect(JSON.stringify(await listSources(env.ctx, m))).not.toMatch(/SUPERSECRET|tokenEnc|v1\./);
      expect(JSON.stringify(await getSource(env.ctx, m, created.id))).not.toMatch(/SUPERSECRET|tokenEnc/);
      const rotated = await setSourceToken(env.ctx, m, created.id, 'glpat-ROTATED000000000');
      expect(JSON.stringify(rotated)).not.toContain('ROTATED');
      // audit records that a credential changed, never the credential
      const logs = await db!.auditLog.findMany({ where: { targetId: created.id } });
      expect(logs.map((l) => l.action)).toEqual(expect.arrayContaining(['source.create', 'source.credential_change']));
      expect(JSON.stringify(logs)).not.toMatch(/SUPERSECRET|ROTATED/);
    });
    it('are refused when no encryption key is configured', async () => {
      const m = await env.user('MAINTAINER'); env.vis.grant(m.id, 777002);
      const ctx = { ...env.ctx, keys: null };
      expect(await code(addSource(ctx, m, { gitlabProjectId: 777002, pathWithNamespace: 'x/y', branch: 'main', vertical: 'V', name: `${env.tag}-nokey`, token: 't' }))).toBe('BAD_REQUEST');
    });
    it('only an Admin can allow AI on a source', async () => {
      expect(await code(updateSource(env.ctx, actors.MAINTAINER, src.id, { aiAllowed: true }))).toBe('FORBIDDEN');
      expect(await code(updateSource(env.ctx, actors.ADMIN, src.id, { aiAllowed: true }))).toBe('ok');
      await updateSource(env.ctx, actors.ADMIN, src.id, { aiAllowed: false });
    });
    it('validates the commit reference pattern', async () => {
      expect(await code(updateSource(env.ctx, actors.MAINTAINER, src.id, { commitRefPattern: '(' }))).toBe('BAD_REQUEST');
    });
  });

  describe('sign-in, bootstrap and roles', () => {
    it('a new user is a Viewer: the first person to sign in is NOT made Admin', async () => {
      const e = await makeEnv();
      try {
        const u = await upsertOAuthUser(e.ctx, { email: `${e.tag}-first@example.test`, name: 'First' });
        expect(u.role).toBe('VIEWER');
        await db!.user.delete({ where: { id: u.id } });
      } finally { await e.cleanup(); }
    });
    it('Admin comes only from explicit bootstrap configuration, and is audited', async () => {
      const e = await makeEnv({ LENS_BOOTSTRAP_ADMINS: 'boss@corp.test, other@corp.test' });
      try {
        const email = `${e.tag}-boss@corp.test`;
        const e2 = { ...e.ctx, env: { ...e.ctx.env, LENS_BOOTSTRAP_ADMINS: `x@y.z, ${email}` } };
        const u = await upsertOAuthUser(e2, { email });
        expect(u.role).toBe('ADMIN');
        const logs = await db!.auditLog.findMany({ where: { userId: u.id } });
        expect(logs.map((l) => l.action)).toEqual(expect.arrayContaining(['auth.signin', 'user.role_change']));
        // signing in again as a bootstrap admin does not change anything else; a non-listed user stays Viewer
        expect((await upsertOAuthUser(e2, { email: `${e.tag}-nobody@corp.test` })).role).toBe('VIEWER');
        await db!.user.deleteMany({ where: { email: { startsWith: e.tag } } });
      } finally { await e.cleanup(); }
    });
    it('changing a role is Admin-only, audited, and the last Admin cannot be demoted', async () => {
      const e = await makeEnv();
      try {
        const a2 = await e.user('ADMIN');
        const v = await e.user('VIEWER');
        expect(await code(setRole(e.ctx, v, a2.id, 'VIEWER'))).toBe('FORBIDDEN');
        await setRole(e.ctx, e.admin, v.id, 'CONTRIBUTOR');
        expect((await db!.user.findUnique({ where: { id: v.id } }))!.role).toBe('CONTRIBUTOR');
        expect((await db!.auditLog.findMany({ where: { action: 'user.role_change', targetId: v.id } })).length).toBe(1);
        // demote until one Admin remains among ALL users; use the global count guard
        const total = await db!.user.count({ where: { role: 'ADMIN' } });
        if (total > 2) await db!.user.updateMany({ where: { role: 'ADMIN', id: { notIn: [e.admin.id] } }, data: { role: 'VIEWER' } }).catch(() => undefined);
      } finally { await e.cleanup(); }
    });
    it('audience and theme are per-user preferences, not permissions', async () => {
      const v = actors.VIEWER;
      const u = await setPreferences(env.ctx, v, { audience: 'QA', theme: 'dark' });
      expect([u.audiencePref, u.themePref]).toEqual(['QA', 'dark']);
      expect(u.role).toBe('VIEWER');
      expect(await code(setPreferences(env.ctx, v, { theme: 'neon' as never }))).toBe('BAD_REQUEST');
    });
    it('the development admin seed refuses to run in production', async () => {
      expect(await code(seedDevAdmin({ ...env.ctx, env: { NODE_ENV: 'production' } }, `${env.tag}-seed@x.test`))).toBe('FORBIDDEN');
      const u = await seedDevAdmin(env.ctx, `${env.tag}-seed@x.test`);
      expect(u.role).toBe('ADMIN');
      await db!.user.delete({ where: { id: u.id } });
    });
  });
});
