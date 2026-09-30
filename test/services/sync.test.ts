/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GitLabHttpError } from '@lens/gitlab';
import {
  enqueueSync, runSyncJob, listSyncRuns, runProgress, addCustomProcess, removeCustomProcess, addManualEdge, removeManualEdge, unresolvedManualEdges, loadModel, applyOverlays, ServiceError,
} from '@lens/services';
import { db, dbReachable, makeEnv, type Env } from '../helpers/services';

const P = 'NewBusiness/';

describe.skipIf(!dbReachable)('sync jobs, snapshots and overlays (real database, fake GitLab from the fixture)', () => {
  let env: Env; let src: { id: string };
  beforeAll(async () => { env = await makeEnv(); });
  afterAll(async () => { await env.cleanup(); await db!.$disconnect(); });
  const activeSnaps = (id: string) => db!.graphSnapshot.findMany({ where: { sourceId: id }, orderBy: { createdAt: 'asc' } });

  it('first sync is full: 93 ABL files stored, head recorded, snapshot ACTIVE, run DONE with progress', async () => {
    src = await env.source({ token: 'glpat-SYNCTOKEN000000' });
    const runId = await env.syncNow(src.id);
    const run = await db!.syncRun.findUnique({ where: { id: runId } });
    expect(run).toMatchObject({ status: 'DONE', mode: 'full', toSha: 'aaaaaaa1' });
    expect(run!.countsJson).toMatchObject({ files: 105, symbols: 89, commits: 11 });
    const snaps = await activeSnaps(src.id);
    expect(snaps).toHaveLength(1);
    expect(snaps[0]).toMatchObject({ status: 'ACTIVE', sha: 'aaaaaaa1' });
    const abl = await db!.file.count({ where: { snapshotId: snaps[0]!.id, path: { endsWith: '.cls' } } });
    const other = await db!.file.count({ where: { snapshotId: snaps[0]!.id, OR: [{ path: { endsWith: '.p' } }, { path: { endsWith: '.i' } }] } });
    expect(abl + other).toBe(93);
    expect((await db!.commit.count({ where: { snapshotId: snaps[0]!.id } }))).toBe(11);
    expect((await db!.source.findUnique({ where: { id: src.id } }))).toMatchObject({ lastSha: 'aaaaaaa1', status: 'IDLE' });
    expect(env.gl.lastToken).toBe('glpat-SYNCTOKEN000000'); // the encrypted source credential was decrypted for the sync
    const msgs = (await db!.jobProgress.findMany({ where: { jobId: runId }, orderBy: { createdAt: 'asc' } })).map((r) => r.message);
    expect(msgs).toEqual(expect.arrayContaining(['parsing', 'snapshotting']));
  });

  it('a second click while a run is in flight returns that run instead of creating another', async () => {
    const a = await enqueueSync(env.ctx, env.admin, src.id);
    const b = await enqueueSync(env.ctx, env.admin, src.id);
    expect(a.alreadyRunning).toBe(false);
    expect(b).toEqual({ runId: a.runId, alreadyRunning: true });
    expect(await db!.syncRun.count({ where: { sourceId: src.id, status: 'QUEUED' } })).toBe(1);
    expect(env.queue.sent.filter((s) => s.data.runId === a.runId)).toHaveLength(1);
    await runSyncJob(env.ctx, a.runId); // finish it: unchanged head
  });

  it('a sync with an unchanged head is SKIPPED and creates no new snapshot', async () => {
    const before = (await activeSnaps(src.id)).length;
    const runId = await env.syncNow(src.id);
    expect((await db!.syncRun.findUnique({ where: { id: runId } }))!.status).toBe('SKIPPED');
    expect((await activeSnaps(src.id)).length).toBe(before);
  });

  it('a moved head syncs incrementally (only changed files fetched) and supersedes the old snapshot', async () => {
    const archives = env.gl.calls.archive;
    env.gl.advance('bbbbbbb2', (f) => { const k = `${P}src/domain/entities/CollectionInstruction.cls`; f.set(k, f.get(k)! + '\n/* touched */\n'); });
    const runId = await env.syncNow(src.id);
    expect(await db!.syncRun.findUnique({ where: { id: runId } })).toMatchObject({ status: 'DONE', mode: 'incremental', toSha: 'bbbbbbb2' });
    expect(env.gl.calls.archive).toBe(archives); // no second archive download
    const snaps = await activeSnaps(src.id);
    expect(snaps.map((s) => s.status)).toEqual(['SUPERSEDED', 'ACTIVE']);
    expect(snaps.filter((s) => s.status === 'ACTIVE')).toHaveLength(1);
  });

  it('a missing previous SHA (force-push) falls back to a full sync', async () => {
    env.gl.advance('ccccccc3', (f) => f.set(`${P}README.md`, (f.get(`${P}README.md`) ?? '') + '\nmore'));
    env.gl.forgetSha = true;
    const archives = env.gl.calls.archive;
    const runId = await env.syncNow(src.id);
    env.gl.forgetSha = false;
    expect(await db!.syncRun.findUnique({ where: { id: runId } })).toMatchObject({ status: 'DONE', mode: 'full' });
    expect(env.gl.calls.archive).toBe(archives + 1);
  });

  it('a failed sync (GitLab error) leaves the previous snapshot active and marks the run and source', async () => {
    const before = await db!.graphSnapshot.findFirst({ where: { sourceId: src.id, status: 'ACTIVE' } });
    env.gl.advance('ddddddd4', () => {});
    env.gl.failNext = new GitLabHttpError(500, 'boom');
    const runId = await env.syncNow(src.id);
    expect(await db!.syncRun.findUnique({ where: { id: runId } })).toMatchObject({ status: 'FAILED' });
    expect((await db!.graphSnapshot.findFirst({ where: { sourceId: src.id, status: 'ACTIVE' } }))!.id).toBe(before!.id);
    expect((await db!.source.findUnique({ where: { id: src.id } }))!.status).toBe('ERROR');
    const logs = await db!.auditLog.findMany({ where: { action: 'sync.failed', targetId: src.id } });
    expect(logs.length).toBeGreaterThan(0);
    // the next sync recovers
    const ok = await env.syncNow(src.id);
    expect((await db!.syncRun.findUnique({ where: { id: ok } }))!.status).toBe('DONE');
    expect((await db!.source.findUnique({ where: { id: src.id } }))!.status).toBe('IDLE');
  });

  it('a snapshot that would collapse the graph is rejected and the old one stays active', async () => {
    const before = await db!.graphSnapshot.findFirst({ where: { sourceId: src.id, status: 'ACTIVE' } });
    env.gl.advance('eeeeeee5', (f) => { for (const k of [...f.keys()]) if (k.endsWith('.cls')) f.delete(k); });
    env.gl.forgetSha = true;
    const runId = await env.syncNow(src.id);
    env.gl.forgetSha = false;
    expect((await db!.syncRun.findUnique({ where: { id: runId } }))!.status).toBe('FAILED');
    expect((await db!.graphSnapshot.findFirst({ where: { sourceId: src.id, status: 'ACTIVE' } }))!.id).toBe(before!.id);
    // restore for later tests
    env.gl.advance('fffffff6', (f) => { for (const x of env.fx.source) f.set(x.path, x.text); });
    env.gl.forgetSha = true; await env.syncNow(src.id); env.gl.forgetSha = false;
  });

  it('a worker restart re-running a finished job is a no-op; an interrupted in-flight run is resumed', async () => {
    const done = await db!.syncRun.findFirst({ where: { sourceId: src.id, status: 'DONE' }, orderBy: { startedAt: 'desc' } });
    const snapsBefore = (await activeSnaps(src.id)).length;
    await runSyncJob(env.ctx, done!.id);
    expect((await activeSnaps(src.id)).length).toBe(snapsBefore);
    // simulate a crash mid-run: the run is left PARSING; the queue redelivers the job
    env.gl.advance('1111111a', (f) => f.set(`${P}CHANGELOG.md`, 'x'));
    const r = await db!.syncRun.create({ data: { sourceId: src.id, status: 'PARSING', stage: 'parsing' } });
    await runSyncJob(env.ctx, r.id);
    expect((await db!.syncRun.findUnique({ where: { id: r.id } }))!.status).toBe('DONE');
  });

  it('sync history and progress are readable by anyone who can see the source', async () => {
    const viewer = await env.user('VIEWER');
    const runs = await listSyncRuns(env.ctx, viewer, src.id);
    expect(runs.length).toBeGreaterThan(3);
    const p = await runProgress(env.ctx, viewer, runs[0]!.id);
    expect(p!.finished).toBe(true);
  });

  describe('custom processes and manual mappings survive re-syncs', () => {
    it('adds a custom process (mapped with the ingestion heuristics), then keeps it across a full re-sync', async () => {
      const m = await env.user('MAINTAINER');
      const cp = await addCustomProcess(env.ctx, m, src.id, { name: 'Collections review', description: 'Ops review', steps: 'Review collection instruction | BR-005\nCheck benefit selection\nApprove' });
      const now = await loadModel(env.ctx, src.id);
      const p = now.view.processes.find((x) => x.name === 'Collections review')!;
      expect(p.steps).toHaveLength(3);
      expect(p.steps[0]!.req).toBe('BR-005');
      expect(p.steps[0]!.files.some((f) => f.endsWith('CollectionInstruction.cls'))).toBe(true);
      const edges = now.graph.edges.filter((e) => e.from === 'step:Collections review#1');
      expect(edges.find((e) => e.type === 'maps-step-req')).toMatchObject({ origin: 'MANUAL', confidence: 1 }); // the user stated it
      // re-sync from scratch: the process is re-projected onto the new snapshot
      env.gl.advance('2222222b', (f) => f.set(`${P}CHANGELOG.md`, 'y'));
      env.gl.forgetSha = true; await env.syncNow(src.id); env.gl.forgetSha = false;
      const after = await loadModel(env.ctx, src.id);
      expect(after.snapshot.id).not.toBe(now.snapshot.id);
      expect(after.view.processes.map((x) => x.name)).toContain('Collections review');
      expect(after.graph.processes.find((x) => x.name === 'Collections review')!.origin).toBe('MANUAL');
      // duplicates are refused; removal works and is audited
      await expect(addCustomProcess(env.ctx, m, src.id, { name: 'collections REVIEW', steps: 'a\nb' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      await removeCustomProcess(env.ctx, m, src.id, cp.id);
      expect((await loadModel(env.ctx, src.id)).view.processes.map((x) => x.name)).not.toContain('Collections review');
      expect((await db!.auditLog.findMany({ where: { targetId: cp.id } })).map((l) => l.action).sort()).toEqual(['process.create', 'process.remove']);
    });

    it('validates custom process input', async () => {
      const m = await env.user('MAINTAINER');
      await expect(addCustomProcess(env.ctx, m, src.id, { name: 'x', steps: 'a\nb' })).rejects.toBeInstanceOf(ServiceError);
      await expect(addCustomProcess(env.ctx, m, src.id, { name: 'Valid name', steps: 'only one' })).rejects.toBeInstanceOf(ServiceError);
    });

    it('manual edges are kept across syncs, carry origin MANUAL, and are flagged (not dropped) if an end disappears', async () => {
      const m = await env.user('MAINTAINER');
      const from = `file:${P}src/api/RestGateway.cls`, to = 'req:BR-005';
      const me = await addManualEdge(env.ctx, m, src.id, { type: 'implements-req', fromRef: from, toRef: to, note: 'gateway validates day' });
      await expect(addManualEdge(env.ctx, m, src.id, { type: 'implements-req', fromRef: 'file:nope.cls', toRef: to })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      const has = async () => (await loadModel(env.ctx, src.id)).graph.edges.find((e) => e.type === 'implements-req' && e.from === from && e.to === to);
      expect((await has())).toMatchObject({ origin: 'MANUAL', confidence: 1 });
      env.gl.advance('3333333c', (f) => f.set(`${P}CHANGELOG.md`, 'z'));
      env.gl.forgetSha = true; await env.syncNow(src.id); env.gl.forgetSha = false;
      expect((await has())).toMatchObject({ origin: 'MANUAL' });
      expect(await unresolvedManualEdges(env.ctx, m, src.id)).toHaveLength(0);
      // the file disappears upstream
      env.gl.advance('4444444d', (f) => f.delete(`${P}src/api/RestGateway.cls`));
      await env.syncNow(src.id);
      expect(await has()).toBeUndefined();
      const un = await unresolvedManualEdges(env.ctx, m, src.id);
      expect(un.map((x) => x.id)).toEqual([me.id]);
      // put it back: the mapping resolves again
      env.gl.advance('5555555e', (f) => { const k = `${P}src/api/RestGateway.cls`; f.set(k, env.fx.source.find((x) => x.path === k)!.text); });
      await env.syncNow(src.id);
      expect(await has()).toMatchObject({ origin: 'MANUAL' });
      expect(await unresolvedManualEdges(env.ctx, m, src.id)).toHaveLength(0);
      await removeManualEdge(env.ctx, m, src.id, me.id);
      expect(await has()).toBeUndefined();
    });

    it('applyOverlays is pure and reports what it could not place', () => {
      const g = env.fx.graph;
      const r = applyOverlays(g, {
        customProcesses: [{ id: 'c1', name: 'New Business Process', description: null, steps: [{ n: 1, name: 'x', requirement: null }] }],
        manualEdges: [{ id: 'm1', type: 'uses', fromRef: 'file:nope', toRef: 'file:nope2', note: null, createdBy: 'u', createdAt: new Date() }, { id: 'm2', type: 'bogus', fromRef: `file:${P}src/Bootstrap.cls`, toRef: 'req:BR-001', note: null, createdBy: 'u', createdAt: new Date() }],
      });
      expect(r.skippedProcesses).toEqual(['New Business Process']); // name collision with a detected process
      expect(r.unresolvedEdgeIds.sort()).toEqual(['m1', 'm2']);
      expect(r.graph.edges).toEqual(g.edges);
    });
  });

  it('immutability: the active snapshot rows cannot be edited in place', async () => {
    const snap = await db!.graphSnapshot.findFirst({ where: { sourceId: src.id, status: 'ACTIVE' } });
    await expect(db!.file.updateMany({ where: { snapshotId: snap!.id }, data: { loc: 0 } })).rejects.toThrow(/immutable/);
  });
});
