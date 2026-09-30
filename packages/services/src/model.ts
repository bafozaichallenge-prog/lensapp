import type { Source, GraphSnapshot } from '@prisma/client';
import type { CommitInput, GraphInput } from '@lens/core';
import { linkTicketCommit, resolvePaths } from '@lens/ingest';
import { buildView, type GraphView } from '@lens/impact';
import { loadGraph, loadFileTexts } from '@lens/storage';
import type { IncidentInfo, RepoIndex, TicketInfo } from '@lens/ai';
import { buildRepoIndex } from '@lens/ai';
import type { Ctx } from './context';
import { notFound } from './context';

export interface Model {
  source: Source;
  snapshot: GraphSnapshot;
  graph: GraphInput;
  commits: CommitInput[];
  tickets: TicketInfo[];
  incidents: IncidentInfo[];
  view: GraphView;
}

// Snapshots are immutable once active, so their graph and history can be cached safely.
const cache = new Map<string, { graph: GraphInput; commits: CommitInput[] }>();
const CACHE_MAX = 6;

async function snapshotData(ctx: Ctx, snapshotId: string) {
  const hit = cache.get(snapshotId);
  if (hit) { cache.delete(snapshotId); cache.set(snapshotId, hit); return hit; }
  const [graph, rows] = await Promise.all([
    loadGraph(ctx.db, snapshotId),
    ctx.db.commit.findMany({ where: { snapshotId }, include: { files: true }, orderBy: { date: 'asc' } }),
  ]);
  const commits: CommitInput[] = rows.map((c) => ({ sha: c.sha, author: c.author, date: c.date.toISOString(), subject: c.subject, parents: c.parents, branch: c.branch ?? undefined, files: c.files.map((f) => ({ path: f.path, additions: f.additions, deletions: f.deletions })) }));
  const v = { graph, commits };
  cache.set(snapshotId, v);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return v;
}
// File contents of an immutable snapshot, kept for the few most recent snapshots (packs and code views read many files).
const texts = new Map<string, Map<string, string>>();
const TEXT_CACHE_MAX = 2;
async function snapshotTexts(ctx: Ctx, snapshotId: string): Promise<Map<string, string>> {
  const hit = texts.get(snapshotId);
  if (hit) { texts.delete(snapshotId); texts.set(snapshotId, hit); return hit; }
  const m = new Map((await loadFileTexts(ctx.db, ctx.storage, snapshotId)).map((f) => [f.path, f.text]));
  texts.set(snapshotId, m);
  if (texts.size > TEXT_CACHE_MAX) texts.delete(texts.keys().next().value!);
  return m;
}
/** One file's text from a snapshot without loading the rest (class pages). */
export async function loadFileText(ctx: Ctx, snapshotId: string, path: string): Promise<string | null> {
  const cached = texts.get(snapshotId)?.get(path);
  if (cached != null) return cached;
  const f = await ctx.db.file.findUnique({ where: { snapshotId_path: { snapshotId, path } }, select: { blobSha: true } });
  if (!f?.blobSha) return null;
  const b = await ctx.storage.get(f.blobSha);
  return b ? new TextDecoder().decode(b) : null;
}
export const clearModelCache = () => { cache.clear(); texts.clear(); };
/** Drop a snapshot from the cache (used when overlay rows are projected into it). */
export const forgetSnapshot = (id: string) => cache.delete(id);

/** Load the graph for a source at its active snapshot (or a pinned historical one) with imported history resolved against it. */
export async function loadModel(ctx: Ctx, sourceId: string, snapshotId?: string): Promise<Model> {
  const source = await ctx.db.source.findUnique({ where: { id: sourceId } });
  if (!source) throw notFound('Source not found.');
  const snapshot = snapshotId
    ? await ctx.db.graphSnapshot.findFirst({ where: { id: snapshotId, sourceId } })
    : await ctx.db.graphSnapshot.findFirst({ where: { sourceId, status: 'ACTIVE' } });
  if (!snapshot) throw notFound(snapshotId ? 'Snapshot not found.' : 'This source has not been synced yet.');
  const { graph, commits } = await snapshotData(ctx, snapshot.id);
  const paths = graph.files.map((f) => f.path);
  const [ticketRows, incidentRows] = await Promise.all([
    ctx.db.ticket.findMany({ where: { sourceId }, orderBy: { key: 'asc' } }),
    ctx.db.incident.findMany({ where: { sourceId }, include: { files: true }, orderBy: { key: 'asc' } }),
  ]);
  const tickets: TicketInfo[] = ticketRows.map((t) => ({
    key: t.key, taskmanager: t.taskmanager ?? '', title: t.title, note: t.note ?? '', reqs: t.reqs,
    commit: linkTicketCommit({ key: t.key, taskmanager: t.taskmanager ?? '', type: t.type ?? '', title: t.title, status: t.status ?? '', note: t.note ?? '', reqs: t.reqs, commitRef: t.commitRef ?? '' }, commits),
  }));
  const incidents: IncidentInfo[] = incidentRows.map((i) => {
    const res = resolvePaths(i.files.map((f) => f.path), paths);
    return { key: i.key, severity: i.severity ?? '', status: i.status ?? '', title: i.title, rootCause: i.rootCause ?? '', files: res.map((r, n) => r.resolved ?? i.files[n]!.path), reqs: i.reqs, fixTicket: i.fixTicket, residual: i.residual ?? '' };
  });
  const view = buildView(graph, { incidents: incidents.map((i) => ({ key: i.key, files: i.files, reqs: i.reqs })), tickets: tickets.map((t) => ({ key: t.key, commit: t.commit })), commits });
  return { source, snapshot, graph, commits, tickets, incidents, view };
}

/** RepoIndex (with file contents) for the AI layer and process packs, bound to the model's snapshot. */
export async function loadRepoIndex(ctx: Ctx, m: Model): Promise<RepoIndex> {
  const files = [...(await snapshotTexts(ctx, m.snapshot.id))].map(([path, text]) => ({ path, text }));
  return buildRepoIndex({ sourceName: m.source.name, vertical: m.source.vertical, graph: m.graph, view: m.view, commits: m.commits, tickets: m.tickets, incidents: m.incidents, files });
}
