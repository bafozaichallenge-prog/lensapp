import { Prisma } from '@prisma/client';
import { decrypt } from '@lens/core';
import { parseSource } from '@lens/ingest';
import { loadFileTexts, saveAndActivateSnapshot } from '@lens/storage';
import { syncSource, type SyncStage } from '@lens/gitlab';
import { audit } from './audit';
import { badRequest, type Actor, type Ctx } from './context';
import { requireSource } from './access';
import { applyOverlays, loadOverlayInput, refreshLinks } from './overlays';

const STATUS: Record<SyncStage, 'QUEUED' | 'FETCHING_CODE' | 'FETCHING_HISTORY' | 'PARSING' | 'LINKING' | 'SNAPSHOTTING' | 'DONE' | 'FAILED'> = {
  'queued': 'QUEUED', 'fetching code': 'FETCHING_CODE', 'fetching history': 'FETCHING_HISTORY', 'parsing': 'PARSING', 'linking': 'LINKING', 'snapshotting': 'SNAPSHOTTING', 'done': 'DONE', 'failed': 'FAILED',
};
const INFLIGHT = ['QUEUED', 'FETCHING_CODE', 'FETCHING_HISTORY', 'PARSING', 'LINKING', 'SNAPSHOTTING'] as const;

/** "Sync now": Maintainer+ with source visibility. A second click while a run is in flight returns that run. */
export async function enqueueSync(ctx: Ctx, actor: Actor, sourceId: string, opts: { full?: boolean } = {}) {
  const source = await requireSource(ctx, actor, 'source.sync', sourceId);
  try {
    const run = await ctx.db.syncRun.create({ data: { sourceId, triggeredBy: actor.id, full: !!opts.full, status: 'QUEUED', fromSha: source.lastSha } });
    await ctx.queue.send('sync', { runId: run.id });
    await audit(ctx, actor.id, 'sync.queued', { type: 'source', id: sourceId }, { runId: run.id, full: !!opts.full });
    return { runId: run.id, alreadyRunning: false };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const cur = await ctx.db.syncRun.findFirst({ where: { sourceId, status: { in: [...INFLIGHT] } }, orderBy: { startedAt: 'desc' } });
      if (cur) return { runId: cur.id, alreadyRunning: true };
    }
    throw e;
  }
}

/** Sync history for the Explore overview / source page. */
export async function listSyncRuns(ctx: Ctx, actor: Actor, sourceId: string, take = 20) {
  await requireSource(ctx, actor, 'source.view', sourceId);
  return ctx.db.syncRun.findMany({ where: { sourceId }, orderBy: { startedAt: 'desc' }, take, select: { id: true, status: true, stage: true, mode: true, fromSha: true, toSha: true, startedAt: true, finishedAt: true, countsJson: true, log: true } });
}

/** Progress feed for one run (also served over SSE by the web app). */
export async function runProgress(ctx: Ctx, actor: Actor, runId: string, after?: Date) {
  const run = await ctx.db.syncRun.findUnique({ where: { id: runId } });
  if (!run) return null;
  await requireSource(ctx, actor, 'source.view', run.sourceId);
  const rows = await ctx.db.jobProgress.findMany({ where: { jobId: runId, ...(after ? { createdAt: { gt: after } } : {}) }, orderBy: { createdAt: 'asc' } });
  return { status: run.status, stage: run.stage, finished: !INFLIGHT.includes(run.status as never), messages: rows.map((r) => ({ at: r.createdAt, message: r.message })) };
}

/**
 * Worker entry point for a queued sync. Safe to re-run after a worker restart: an in-flight run is picked up again,
 * finished runs are ignored, and the active snapshot changes only when a new one validates.
 */
export async function runSyncJob(ctx: Ctx, runId: string) {
  const run = await ctx.db.syncRun.findUnique({ where: { id: runId }, include: { source: true } });
  if (!run || ['DONE', 'FAILED', 'SKIPPED'].includes(run.status)) return;
  const source = run.source;
  await ctx.db.source.update({ where: { id: source.id }, data: { status: 'SYNCING' } });
  const say = async (stage: SyncStage, message?: string) => {
    await ctx.db.syncRun.update({ where: { id: runId }, data: { status: STATUS[stage] === 'DONE' || STATUS[stage] === 'FAILED' ? run.status : STATUS[stage], stage } });
    await ctx.db.jobProgress.create({ data: { jobId: runId, kind: 'sync', message: message ?? stage } });
  };
  try {
    const token = await resolveToken(ctx, source.tokenEnc, run.triggeredBy);
    const gl = ctx.makeGitLab(source, token);
    let counts: Record<string, number> | undefined;
    const pending: Promise<unknown>[] = [];
    const result = await syncSource(source.id, {
      source: async () => ({ id: source.id, projectId: source.gitlabProjectId, branch: source.branch, pathFilters: source.pathFilters }),
      gitlab: gl,
      active: async (id) => {
        const snap = await ctx.db.graphSnapshot.findFirst({ where: { sourceId: id, status: 'ACTIVE' } });
        return snap ? { sha: snap.sha, files: await loadFileTexts(ctx.db, ctx.storage, snap.id) } : undefined;
      },
      parse: (files, history) => parseSource(files, history),
      commit: async (id, sha, files, commits, graph) => {
        const overlay = applyOverlays(graph, await loadOverlayInput(ctx, id));
        const res = await saveAndActivateSnapshot(ctx.db, ctx.storage, { sourceId: id, sha, syncRunId: runId, graph: overlay.graph, files, commits });
        if (res.ok) {
          await refreshLinks(ctx, id, res.snapshotId, overlay.unresolvedEdgeIds, overlay.resolvedEdgeIds);
          counts = { files: overlay.graph.files.length, symbols: overlay.graph.symbols.length, edges: overlay.graph.edges.length, requirements: overlay.graph.requirements.length, processes: overlay.graph.processes.length, commits: commits.length, unresolvedManualEdges: overlay.unresolvedEdgeIds.length };
        }
        return { ok: res.ok, issues: res.issues };
      },
      acquire: async () => true, // the unique in-flight index on sync_runs is the lock
      release: async () => {},
      progress: (_id, stage, message) => { pending.push(say(stage, message)); },
    }, { full: run.full });
    await Promise.all(pending); // progress writes settle before the final state is written
    const final = result.status === 'done' ? 'DONE' : result.status === 'skipped' ? 'SKIPPED' : 'FAILED';
    await ctx.db.syncRun.update({ where: { id: runId }, data: { status: final, stage: final.toLowerCase(), mode: result.mode ?? null, toSha: result.sha ?? null, countsJson: counts, log: result.error ?? result.reason ?? null, finishedAt: ctx.now() } });
    await ctx.db.source.update({ where: { id: source.id }, data: { status: final === 'FAILED' ? 'ERROR' : 'IDLE' } });
    await audit(ctx, run.triggeredBy, final === 'FAILED' ? 'sync.failed' : 'sync.done', { type: 'source', id: source.id }, { runId, mode: result.mode, sha: result.sha, error: result.error });
  } catch (e) {
    await ctx.db.syncRun.update({ where: { id: runId }, data: { status: 'FAILED', stage: 'failed', log: (e as Error).message, finishedAt: ctx.now() } });
    await ctx.db.source.update({ where: { id: source.id }, data: { status: 'ERROR' } });
    await audit(ctx, run.triggeredBy, 'sync.failed', { type: 'source', id: source.id }, { runId, error: (e as Error).message });
  }
}

/** Source credential first (normal production path); otherwise the triggering user's own GitLab token, for that sync only. */
async function resolveToken(ctx: Ctx, tokenEnc: string | null, userId: string | null): Promise<string | null> {
  if (tokenEnc) {
    if (!ctx.keys) throw badRequest('LENS_ENCRYPTION_KEYS is not configured; cannot decrypt the source credential.');
    return decrypt(tokenEnc, ctx.keys);
  }
  if (!userId) return null;
  const acct = await ctx.db.account.findFirst({ where: { userId, provider: 'gitlab' } });
  return acct?.access_token ?? null;
}
