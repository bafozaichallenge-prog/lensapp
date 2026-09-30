/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPack, renderPackArtefact, enqueuePackRefine, runPackRefineJob, type Actor } from '@lens/services';
import { db, dbReachable, makeEnv, scriptedModel, modelText, type Env } from '../helpers/services';

const AI = { apiKey: 'test', model: 'scripted', provider: 'anthropic' as const, baseUrl: 'http://unused' };
const P = 'NewBusiness/';
const NAME = 'New Business Process';

describe.skipIf(!dbReachable)('process packs (real database)', () => {
  let env: Env; let src: { id: string }; let viewer: Actor, contributor: Actor;
  beforeAll(async () => {
    env = await makeEnv();
    src = await env.source({ aiAllowed: true });
    viewer = await env.user('VIEWER'); contributor = await env.user('CONTRIBUTOR');
    await env.syncNow(src.id);
  }, 30_000);
  afterAll(async () => { env.ctx.ai = null; await env.cleanup(); await db!.$disconnect(); });

  it('builds the spec from the active snapshot: 7 steps, gated activation, sandbox config with baseline before deltas', async () => {
    const p = await getPack(env.ctx, viewer, src.id, NAME);
    expect(p.spec.steps).toHaveLength(7);
    expect(p.spec.steps[6].screen.action.roles).toEqual(['SUPERVISOR', 'ADMIN']);
    expect(p.config.database.schema).toEqual(['database/schema/newbusiness.df']);
    expect(p.config.database.deltasInOrder[0]).toContain('002_benefit_cover_amount');
    expect(p.refined).toBe(false);
    expect(p.sha).toBe('aaaaaaa1');
  });

  it('renders every artefact type; the selected theme is passed to the HTML; downloads are named from the process', async () => {
    for (const k of ['doc', 'explainer', 'prototype'] as const) {
      const a = await renderPackArtefact(env.ctx, viewer, src.id, NAME, k, 'dark');
      expect(a.mime).toMatch(/text\/html/);
      expect(a.body).toContain('data-theme="dark"');
      expect(a.filename).toBe(k === 'doc' ? 'new-business-process-explainer.html' : `new-business-process-${k}.html`);
      expect(a.body).not.toMatch(/__SPEC__|__BRAND__/);
    }
    expect((await renderPackArtefact(env.ctx, viewer, src.id, NAME, 'markdown')).body).toContain('# New Business Process');
    const y = await renderPackArtefact(env.ctx, viewer, src.id, NAME, 'config-yaml');
    expect(y.body).toContain('kind: SandboxConfig');
    expect(JSON.parse((await renderPackArtefact(env.ctx, viewer, src.id, NAME, 'config-json')).body).kind).toBe('SandboxConfig');
  });

  it('sample values are synthetic and no real repository personal data enters the artefacts', async () => {
    const html = (await renderPackArtefact(env.ctx, viewer, src.id, NAME, 'prototype')).body;
    expect(html).toContain('Sizwe');
    expect(html).not.toMatch(/glpat-|@corp\./);
  });

  it('is invisible to users without GitLab access, and unknown processes are not found', async () => {
    const outsider = await env.user('ADMIN', { gitlab: false });
    await expect(getPack(env.ctx, outsider, src.id, NAME)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(renderPackArtefact(env.ctx, outsider, src.id, NAME, 'doc')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(getPack(env.ctx, viewer, src.id, 'Nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  describe('wording refinement', () => {
    const refinedReply = async (mut?: (steps: any[]) => void) => {
      const base = (await getPack(env.ctx, viewer, src.id, NAME)).spec;
      const steps = base.steps.map((s: any) => ({ n: +s.n, title: `Refined ${s.title}`, say: 'In plain words.', rules: s.rules, chips: s.chips }));
      mut?.(steps);
      return JSON.stringify({ steps });
    };

    it('needs AI configured and enabled for the source, and Contributor+', async () => {
      await expect(enqueuePackRefine(env.ctx, contributor, src.id, NAME)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      env.ctx.ai = AI; env.model.current = scriptedModel([]);
      await expect(enqueuePackRefine(env.ctx, viewer, src.id, NAME)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      const j = await enqueuePackRefine(env.ctx, contributor, src.id, NAME);
      expect(j.jobId).toBeTruthy();
      expect(env.queue.sent.at(-1)).toMatchObject({ name: 'pack-refine', data: { sourceId: src.id, processName: NAME } });
      await db!.source.update({ where: { id: src.id }, data: { aiAllowed: false } });
      await expect(enqueuePackRefine(env.ctx, contributor, src.id, NAME)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      await db!.source.update({ where: { id: src.id }, data: { aiAllowed: true } });
    });

    it('an accepted refinement is applied to the pack, and facts are unchanged', async () => {
      const before = await getPack(env.ctx, viewer, src.id, NAME);
      const refined0 = await refinedReply();
      env.model.current = scriptedModel([() => modelText(refined0)]);
      await runPackRefineJob(env.ctx, { sourceId: src.id, processName: NAME, userId: contributor.id });
      const after = await getPack(env.ctx, viewer, src.id, NAME);
      expect(after.refined).toBe(true);
      expect(after.spec.steps[0].title).toBe('Refined Open contract');
      expect(after.specHash).toBe(before.specHash);
      for (let i = 0; i < 7; i++) for (const k of ['screen', 'trace', 'history']) expect(after.spec.steps[i][k]).toEqual(before.spec.steps[i][k]);
      expect(after.config.database).toEqual(before.config.database);
      const audit = await db!.auditLog.findMany({ where: { action: 'pack.refine', userId: contributor.id } });
      expect(audit.length).toBe(1);
    });

    it('a refinement that tampers with rule ids is rejected outright; nothing is saved', async () => {
      const count = await db!.packOverride.count({ where: { sourceId: src.id } });
      const bad = await refinedReply((steps) => { steps[4].rules = steps[4].rules.map(([t, x]: [string, string]) => [t, x.replace('NB-COLLECTION-002', 'NB-INVENTED-9')]); steps.forEach((s, i) => { if (i !== 4) delete s.rules; delete s.chips; delete s.say; delete s.title; }); });
      env.model.current = scriptedModel([() => modelText(bad)]);
      await expect(runPackRefineJob(env.ctx, { sourceId: src.id, processName: NAME, userId: contributor.id })).rejects.toThrow(/rejected/);
      expect(await db!.packOverride.count({ where: { sourceId: src.id } })).toBe(count);
    });

    it('after the facts change in a new snapshot the old refinement is flagged stale and not applied; the spec is regenerated', async () => {
      const applied = await getPack(env.ctx, viewer, src.id, NAME);
      expect(applied.refined).toBe(true);
      env.gl.advance('bbbbbbb2', (f) => {
        const k = `${P}src/domain/rules/CollectionDateRequiredRule.cls`;
        f.set(k, f.get(k)!.replace('between 1 and 28', 'between 1 and 27'));
      });
      await env.syncNow(src.id);
      const next = await getPack(env.ctx, viewer, src.id, NAME);
      expect(next.sha).toBe('bbbbbbb2');
      expect(next.specHash).not.toBe(applied.specHash);
      expect(next.refined).toBe(false);
      expect(next.overrideStale).toBe(true);
      expect(JSON.stringify(next.spec.steps[5].screen.checks)).toContain('between 1 and 27');
    });
  });
});
