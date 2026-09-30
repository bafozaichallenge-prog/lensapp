import type { Prisma } from '@prisma/client';
import { impactIn, bestSource, type ImpactResult } from '@lens/impact';
import { AnalysisCancelled, AnalysisFailed, ERROR_TEXT, graphCrossCheck, planMarkdown, runAnalysis, tasksCsv, testsCls, validateAnalysis, slugify, type Analysis } from '@lens/ai';
import { audit } from './audit';
import { badRequest, forbidden, notFound, type Actor, type Ctx } from './context';
import { requireRole, requireSource, visibleSources } from './access';
import { extractText } from './documents';
import { loadModel, loadRepoIndex } from './model';

export interface UploadedFile { name: string; bytes: Uint8Array }

/** Text the deterministic impact match and the AI read: the description plus the latest version of every document. */
async function requirementText(ctx: Ctx, projectId: string) {
  const p = await ctx.db.changeProject.findUnique({ where: { id: projectId }, include: { documents: { orderBy: [{ filename: 'asc' }, { version: 'desc' }] } } });
  if (!p) throw notFound('Project not found.');
  const latest = new Map<string, (typeof p.documents)[number]>();
  for (const d of p.documents) if (!latest.has(d.filename)) latest.set(d.filename, d);
  const docs = [...latest.values()];
  return { project: p, docs, text: [p.description, ...docs.map((d) => d.text)].filter(Boolean).join('\n\n') };
}

/**
 * Create a change project: extract documents server-side, pick the best-matching visible source automatically
 * (or use the one the user chose), and record how it was chosen (plan §14.2).
 */
export async function createProject(ctx: Ctx, actor: Actor, i: { name: string; description: string; files?: UploadedFile[]; sourceId?: string }) {
  requireRole(actor, 'project.create');
  if (!i.name.trim()) throw badRequest('Give the project a name.');
  const extracted = [];
  for (const f of i.files ?? []) extracted.push({ f, ...(await extractText(f.name, f.bytes)) });
  const text = [i.description, ...extracted.map((e) => e.text)].join('\n\n');
  if (!text.trim()) throw badRequest('Describe the change or attach a requirement document.');

  let sourceId: string; let selection: 'AUTO' | 'MANUAL';
  if (i.sourceId) { await requireSource(ctx, actor, 'project.create', i.sourceId); sourceId = i.sourceId; selection = 'MANUAL'; }
  else {
    const candidates = [];
    for (const s of await visibleSources(ctx, actor)) { try { const m = await loadModel(ctx, s.id); candidates.push({ id: s.id, view: m.view }); } catch { /* not synced */ } }
    const best = bestSource(candidates, text) ?? (candidates[0] ? { source: candidates[0], impact: null } : null);
    if (!best) throw badRequest('There is no synced system data to analyse against yet. Ask a Maintainer to sync a source.');
    sourceId = best.source.id; selection = 'AUTO';
  }
  const project = await ctx.db.changeProject.create({ data: { name: i.name.trim(), description: i.description, sourceId, sourceSelection: selection, createdBy: actor.id } });
  for (const e of extracted) {
    const stored = await ctx.storage.put(e.f.bytes);
    await ctx.db.changeDocument.create({ data: { changeProjectId: project.id, filename: e.f.name, mime: e.mime, text: e.text, chars: e.chars, contentRef: stored.key, version: 1 } });
  }
  await audit(ctx, actor.id, 'project.create', { type: 'project', id: project.id }, { sourceId, selection, documents: extracted.length });
  return project;
}

/** Upload a new version of a document (same filename). The next analysis uses it; earlier analyses keep the version they used. */
export async function addDocumentVersion(ctx: Ctx, actor: Actor, projectId: string, f: UploadedFile) {
  const p = await ctx.db.changeProject.findUnique({ where: { id: projectId } });
  if (!p) throw notFound('Project not found.');
  await requireSource(ctx, actor, 'project.analyse', p.sourceId);
  const e = await extractText(f.name, f.bytes);
  const last = await ctx.db.changeDocument.findFirst({ where: { changeProjectId: projectId, filename: f.name }, orderBy: { version: 'desc' } });
  const stored = await ctx.storage.put(f.bytes);
  return ctx.db.changeDocument.create({ data: { changeProjectId: projectId, filename: f.name, mime: e.mime, text: e.text, chars: e.chars, contentRef: stored.key, version: (last?.version ?? 0) + 1 } });
}

/**
 * Run the deterministic impact analysis against the source's active snapshot and record it as a new analysis version.
 * When AI is enabled for the source the AI pass is queued; otherwise the analysis completes here with the
 * deterministic findings only (Lens stays useful without an AI key).
 */
export async function startAnalysis(ctx: Ctx, actor: Actor, projectId: string) {
  const { project, docs, text } = await requirementText(ctx, projectId);
  const source = await requireSource(ctx, actor, 'project.analyse', project.sourceId);
  const m = await loadModel(ctx, source.id);
  const impact = impactIn(m.view, text);
  const last = await ctx.db.analysis.findFirst({ where: { changeProjectId: projectId }, orderBy: { version: 'desc' } });
  const aiAvailable = !!ctx.ai && !!ctx.makeModel();
  const aiStatus = !aiAvailable ? 'not-configured' : !source.aiAllowed ? 'disabled-for-source' : 'queued';
  const queued = aiStatus === 'queued';
  const analysis = await ctx.db.analysis.create({
    data: {
      changeProjectId: projectId, version: (last?.version ?? 0) + 1, status: queued ? 'QUEUED' : 'DONE', sourceId: source.id, graphSnapshotId: m.snapshot.id, sha: m.snapshot.sha,
      inputDocumentVersionIds: docs.map((d) => d.id), impactJson: { impact, aiStatus } as unknown as Prisma.InputJsonValue,
    },
  });
  await ctx.db.changeProject.update({ where: { id: projectId }, data: { status: queued ? 'ANALYSING' : 'ANALYSED' } });
  if (queued) await ctx.queue.send('analysis', { analysisId: analysis.id });
  await audit(ctx, actor.id, 'analysis.run', { type: 'analysis', id: analysis.id }, { version: analysis.version, aiStatus, snapshot: m.snapshot.id });
  return { analysisId: analysis.id, version: analysis.version, aiStatus };
}

/** Worker entry: the AI pass for a queued analysis, pinned to the snapshot the analysis was created against. */
export async function runAnalysisJob(ctx: Ctx, analysisId: string) {
  const a = await ctx.db.analysis.findUnique({ where: { id: analysisId }, include: { project: true } });
  if (!a || !['QUEUED', 'RUNNING'].includes(a.status)) return;
  const say = (message: string) => ctx.db.jobProgress.create({ data: { jobId: analysisId, kind: 'analysis', message } }).then(() => undefined);
  const model = ctx.makeModel();
  const prevDone = await ctx.db.analysis.count({ where: { changeProjectId: a.changeProjectId, status: 'DONE', id: { not: a.id } } });
  const restoreProject = () => ctx.db.changeProject.update({ where: { id: a.changeProjectId }, data: { status: prevDone ? 'ANALYSED' : 'DRAFT' } });
  if (!model) { await ctx.db.analysis.update({ where: { id: a.id }, data: { status: 'FAILED', error: 'No AI provider is configured.' } }); await restoreProject(); return; }
  await ctx.db.analysis.update({ where: { id: a.id }, data: { status: 'RUNNING' } });
  const ctl = new AbortController();
  const poll = setInterval(async () => { if (await ctx.db.jobProgress.count({ where: { jobId: analysisId, kind: 'cancel' } })) ctl.abort(); }, 1500);
  try {
    const m = await loadModel(ctx, a.sourceId, a.graphSnapshotId);
    const index = await loadRepoIndex(ctx, m);
    const docs = await ctx.db.changeDocument.findMany({ where: { id: { in: a.inputDocumentVersionIds } } });
    const text = [a.project.description, ...docs.map((d) => d.text)].filter(Boolean).join('\n\n');
    const impact = (a.impactJson as unknown as { impact: ImpactResult }).impact;
    await say('Reading the matched source');
    const out = await runAnalysis({ index, impact, request: { name: a.project.name, description: a.project.description, text }, model, signal: ctl.signal, onProgress: (msg) => void say(msg), tokenBudget: Number(ctx.env.LENS_TOKEN_BUDGET) || 400_000 });
    await ctx.db.analysis.update({
      where: { id: a.id },
      data: {
        status: 'DONE', provider: out.provider, model: out.model, promptVersion: out.promptVersion, outputSchemaVersion: out.schemaVersion, inputTokens: out.usage.inputTokens, outputTokens: out.usage.outputTokens, durationMs: out.durationMs,
        resultJson: out.analysis as unknown as Prisma.InputJsonValue, groundingJson: { issues: out.issues, dropped: out.dropped, redactions: out.redactions } as unknown as Prisma.InputJsonValue, transcriptJson: out.transcript as unknown as Prisma.InputJsonValue,
        tasks: { create: out.analysis.tasks.map((t) => ({ key: t.id, system: t.system, type: t.type, title: t.title, description: t.description, acceptance: t.acceptance, files: t.files, step: t.step ?? null, owner: t.owner, priority: t.priority, dependsOn: t.depends_on })) },
      },
    });
    await ctx.db.changeProject.update({ where: { id: a.changeProjectId }, data: { status: 'ANALYSED' } });
    await audit(ctx, a.project.createdBy, 'analysis.done', { type: 'analysis', id: a.id }, { tokens: out.usage, turns: out.turns, dropped: out.dropped.length });
  } catch (e) {
    if (e instanceof AnalysisCancelled) { await ctx.db.analysis.update({ where: { id: a.id }, data: { status: 'CANCELLED', error: ERROR_TEXT.cancelled } }); }
    else {
      const code = e instanceof AnalysisFailed ? e.code : 'error';
      await ctx.db.analysis.update({ where: { id: a.id }, data: { status: 'FAILED', error: ERROR_TEXT[code] ?? `The analysis couldn't finish (${code}). Run it again.` } });
      await audit(ctx, a.project.createdBy, 'analysis.failed', { type: 'analysis', id: a.id }, { code });
    }
    await restoreProject();
  } finally { clearInterval(poll); }
}

/** Stop button: the worker notices between model turns. */
export async function cancelAnalysis(ctx: Ctx, actor: Actor, analysisId: string) {
  const a = await ctx.db.analysis.findUnique({ where: { id: analysisId } });
  if (!a) throw notFound('Analysis not found.');
  await requireSource(ctx, actor, 'project.analyse', a.sourceId);
  if (!['QUEUED', 'RUNNING'].includes(a.status)) return { cancelled: false };
  await ctx.db.jobProgress.create({ data: { jobId: analysisId, kind: 'cancel', message: 'Stop requested' } });
  if (a.status === 'QUEUED') { await ctx.db.analysis.update({ where: { id: a.id }, data: { status: 'CANCELLED', error: ERROR_TEXT.cancelled } }); await ctx.db.changeProject.update({ where: { id: a.changeProjectId }, data: { status: 'DRAFT' } }); }
  return { cancelled: true };
}

export async function analysisProgress(ctx: Ctx, actor: Actor, analysisId: string, after?: Date) {
  const a = await ctx.db.analysis.findUnique({ where: { id: analysisId } });
  if (!a) throw notFound('Analysis not found.');
  await requireSource(ctx, actor, 'source.view', a.sourceId);
  const rows = await ctx.db.jobProgress.findMany({ where: { jobId: analysisId, kind: 'analysis', ...(after ? { createdAt: { gt: after } } : {}) }, orderBy: { createdAt: 'asc' } });
  return { status: a.status, finished: !['QUEUED', 'RUNNING'].includes(a.status), error: a.error, messages: rows.map((r) => ({ at: r.createdAt, message: r.message })) };
}

export async function listProjects(ctx: Ctx, actor: Actor, filter: { sourceId?: string; status?: 'DRAFT' | 'ANALYSING' | 'ANALYSED' | 'FAILED' } = {}) {
  const sources = await visibleSources(ctx, actor);
  const rows = await ctx.db.changeProject.findMany({
    where: { sourceId: filter.sourceId ? filter.sourceId : { in: sources.map((s) => s.id) }, ...(filter.status ? { status: filter.status } : {}) },
    orderBy: { createdAt: 'desc' }, include: { source: { select: { name: true, vertical: true } }, analyses: { where: { status: 'DONE' }, orderBy: { version: 'desc' }, take: 1 } },
  });
  const visible = new Set(sources.map((s) => s.id));
  return rows.filter((p) => visible.has(p.sourceId)).map((p) => {
    const a = p.analyses[0];
    const r = a?.resultJson ? (a.resultJson as unknown as Analysis) : null;
    const imp = (a?.impactJson as unknown as { impact?: ImpactResult } | undefined)?.impact;
    return {
      id: p.id, name: p.name, status: p.status, createdAt: p.createdAt, source: p.source.name, sourceId: p.sourceId, isExample: p.isExample,
      high: r?.risks.filter((x) => x.severity === 'high').length ?? 0, medium: r?.risks.filter((x) => x.severity === 'medium').length ?? 0, tasks: r?.tasks.length ?? 0,
      processes: r ? r.processes.filter((x) => x.stages.some((s) => s.change !== 'none') || x.new_stages.length).length : imp?.processes.length ?? 0,
    };
  });
}

/** Everything the project page shows, bound to the snapshot the analysis was produced from, plus staleness. */
export async function analysisView(ctx: Ctx, actor: Actor, analysisId: string) {
  const a = await ctx.db.analysis.findUnique({ where: { id: analysisId }, include: { project: { include: { documents: true } }, tasks: true } });
  if (!a) throw notFound('Analysis not found.');
  const source = await requireSource(ctx, actor, 'source.view', a.sourceId);
  const [active, pinned] = await Promise.all([
    ctx.db.graphSnapshot.findFirst({ where: { sourceId: a.sourceId, status: 'ACTIVE' } }),
    ctx.db.graphSnapshot.findUnique({ where: { id: a.graphSnapshotId } }),
  ]);
  const stale = !!active && active.id !== a.graphSnapshotId;
  const impact = (a.impactJson as unknown as { impact: ImpactResult; aiStatus: string });
  const parsed = a.resultJson ? validateAnalysis(a.resultJson) : null;
  const result = parsed?.ok ? parsed.value : null;
  const m = await loadModel(ctx, a.sourceId, a.graphSnapshotId);
  return {
    analysis: { id: a.id, version: a.version, status: a.status, error: a.error, createdAt: a.createdAt, provider: a.provider, model: a.model, promptVersion: a.promptVersion, outputSchemaVersion: a.outputSchemaVersion, inputTokens: a.inputTokens, outputTokens: a.outputTokens, durationMs: a.durationMs, sha: a.sha, snapshotId: a.graphSnapshotId, documentVersions: a.inputDocumentVersionIds, aiStatus: impact.aiStatus },
    project: { id: a.project.id, name: a.project.name, description: a.project.description, sourceSelection: a.project.sourceSelection, source: source.name, isExample: a.project.isExample, documents: a.project.documents.map((d) => ({ id: d.id, filename: d.filename, version: d.version, chars: d.chars })) },
    freshness: { stale, analysisSha: a.sha, currentSha: active?.sha ?? a.sha, snapshotSyncedAt: pinned?.activatedAt ?? null, currentSyncedAt: active?.activatedAt ?? null, analysisCreated: a.createdAt },
    impact: impact.impact, crossCheck: graphCrossCheck(impact.impact, m.view, result ?? undefined), result, grounding: a.groundingJson, tasks: a.tasks,
    versions: (await ctx.db.analysis.findMany({ where: { changeProjectId: a.changeProjectId }, orderBy: { version: 'desc' }, select: { id: true, version: true, status: true, createdAt: true, sha: true } })),
  };
}

/** Compare two analysis versions of a project: what moved between them. */
export async function compareAnalyses(ctx: Ctx, actor: Actor, aId: string, bId: string) {
  const [a, b] = await Promise.all([analysisView(ctx, actor, aId), analysisView(ctx, actor, bId)]);
  const set = <T,>(xs: T[], f: (x: T) => string) => new Set(xs.map(f));
  const diff = (x: Set<string>, y: Set<string>) => ({ added: [...y].filter((k) => !x.has(k)), removed: [...x].filter((k) => !y.has(k)) });
  const files = (v: typeof a) => set(v.result?.impact ?? v.impact.seeds.map((p) => ({ path: p })), (x) => x.path);
  return {
    from: { id: a.analysis.id, version: a.analysis.version, sha: a.analysis.sha }, to: { id: b.analysis.id, version: b.analysis.version, sha: b.analysis.sha },
    impact: diff(files(a), files(b)), risks: diff(set(a.result?.risks ?? [], (r) => r.title), set(b.result?.risks ?? [], (r) => r.title)), tasks: diff(set(a.result?.tasks ?? [], (t) => t.title), set(b.result?.tasks ?? [], (t) => t.title)),
    snapshotChanged: a.analysis.snapshotId !== b.analysis.snapshotId,
  };
}

export type ExportKind = 'markdown' | 'jira-csv' | 'tests';

/** Downloads (plan §16.2). Content comes from the stored analysis, never from the current repository state. */
export async function exportAnalysis(ctx: Ctx, actor: Actor, analysisId: string, kind: ExportKind) {
  const v = await analysisView(ctx, actor, analysisId);
  requireRole(actor, 'download');
  const base = slugify(v.project.name);
  const meta = { name: v.project.name, description: v.project.description, source: v.project.source, sha: v.analysis.sha, snapshotId: v.analysis.snapshotId, model: v.analysis.model ?? undefined, promptVersion: v.analysis.promptVersion ?? undefined, created: v.analysis.createdAt.toISOString() };
  if (!v.result) {
    if (kind !== 'markdown') throw badRequest('This analysis has no AI-generated tasks or tests. Run it with AI enabled to export them.');
    const md = [`# ${meta.name}`, '', `Deterministic code-graph findings (no AI analysis). System: ${meta.source} at ${meta.sha.slice(0, 7)}.`, '', '## Directly matched files', ...v.crossCheck.matched.map((p) => `- ${p}`), '', '## Dependents', ...v.crossCheck.dependents.map((p) => `- ${p}`), '', '## Existing tests', ...v.crossCheck.tests.map((p) => `- ${p}`), '', '## Related rules', ...v.crossCheck.rules.map((p) => `- ${p}`), '', `## Past incidents\n${v.crossCheck.incidents.join(', ') || 'none'}`, '', `## Tickets\n${v.crossCheck.tickets.join(', ') || 'none'}`, ''].join('\n');
    return { filename: `${base}-plan.md`, mime: 'text/markdown; charset=utf-8', body: md };
  }
  if (kind === 'markdown') return { filename: `${base}-plan.md`, mime: 'text/markdown; charset=utf-8', body: planMarkdown(meta, v.result) };
  if (kind === 'jira-csv') return { filename: `${base}-tasks.csv`, mime: 'text/csv; charset=utf-8', body: tasksCsv(v.project.name, v.result) };
  return { filename: `${base}-tests.cls`, mime: 'text/plain; charset=utf-8', body: testsCls(v.result) };
}

/** Delete a project: its creator or an Admin. Analyses are removed with it. */
export async function deleteProject(ctx: Ctx, actor: Actor, projectId: string) {
  const p = await ctx.db.changeProject.findUnique({ where: { id: projectId } });
  if (!p) throw notFound('Project not found.');
  await requireSource(ctx, actor, 'source.view', p.sourceId);
  if (p.createdBy !== actor.id && actor.role !== 'ADMIN') throw forbidden();
  await ctx.db.changeProject.delete({ where: { id: projectId } });
}
