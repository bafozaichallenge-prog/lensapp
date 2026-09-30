import type { Edge, EdgeType, GraphInput, ProcessNode } from '@lens/core';
import { parseRef } from '@lens/core';
import { mapProcessAgainstGraph, resolvePaths, linkTicketCommit } from '@lens/ingest';
import type { Ctx } from './context';


const EDGE_TYPES = new Set<string>(['uses', 'creates', 'inherits', 'implements', 'runs', 'includes', 'tests', 'implements-req', 'enforces', 'db-read', 'db-write', 'mirrors', 'maps-step-req', 'maps-step-file', 'maps-step-rule', 'maps-step-table']);

export interface OverlayInput {
  customProcesses: { id: string; name: string; description: string | null; steps: { n: number; name: string; requirement: string | null }[] }[];
  manualEdges: { id: string; type: string; fromRef: string; toRef: string; note: string | null; createdBy: string; createdAt: Date }[];
}
export interface OverlayResult {
  graph: GraphInput;
  resolvedEdgeIds: string[];
  unresolvedEdgeIds: string[];
  skippedProcesses: string[];
}

/**
 * Fold durable, user-created state into a freshly parsed graph (custom processes survive re-syncs; manual edges are
 * re-projected). Pure. A manual edge whose ends no longer resolve is reported, never silently dropped.
 */
export function applyOverlays(g: GraphInput, o: OverlayInput): OverlayResult {
  const processes = [...g.processes];
  const edges: Edge[] = [...g.edges];
  const skippedProcesses: string[] = [];
  const taken = new Set(processes.map((p) => p.name.toLowerCase()));
  for (const cp of o.customProcesses) {
    if (taken.has(cp.name.toLowerCase())) { skippedProcesses.push(cp.name); continue; }
    const node: ProcessNode = { name: cp.name, origin: 'MANUAL', description: cp.description ?? undefined, steps: cp.steps.map((s) => ({ n: s.n, name: s.name, requirement: s.requirement ?? undefined })) };
    const mapped = mapProcessAgainstGraph(g, node).map((e) => (e.origin === 'EXPLICIT' ? { ...e, origin: 'MANUAL' as const } : e));
    processes.push(node);
    edges.push(...mapped);
    taken.add(cp.name.toLowerCase());
  }
  const interim: GraphInput = { ...g, processes, edges };
  const known = refResolver(interim);
  const resolvedEdgeIds: string[] = [], unresolvedEdgeIds: string[] = [];
  for (const m of o.manualEdges) {
    if (!EDGE_TYPES.has(m.type) || !known(m.fromRef) || !known(m.toRef)) { unresolvedEdgeIds.push(m.id); continue; }
    edges.push({ from: m.fromRef, to: m.toRef, type: m.type as EdgeType, origin: 'MANUAL', confidence: 1, evidence: { reason: m.note ? `manual mapping: ${m.note}` : 'manual mapping', refs: [`user:${m.createdBy}`] } });
    resolvedEdgeIds.push(m.id);
  }
  const ord = (a: Edge, b: Edge) => a.type.localeCompare(b.type) || a.from.localeCompare(b.from) || a.to.localeCompare(b.to);
  // de-duplicate on (type, from, to); a MANUAL edge wins over an inferred one
  const uniq = new Map<string, Edge>();
  for (const e of edges) { const k = `${e.type}|${e.from}|${e.to}`; const cur = uniq.get(k); if (!cur || e.origin === 'MANUAL') uniq.set(k, e); }
  return { graph: { ...g, processes, edges: [...uniq.values()].sort(ord) }, resolvedEdgeIds, unresolvedEdgeIds, skippedProcesses };
}

/** Does a stable ref point at something that exists in this graph? */
export function refResolver(g: GraphInput): (ref: string) => boolean {
  const files = new Set(g.files.map((f) => f.path));
  const reqs = new Set(g.requirements.map((r) => r.code));
  const rules = new Set([...g.ruleCodes.map((r) => r.code), ...g.requirements.filter((r) => r.kind === 'rule').map((r) => r.code)]);
  const tables = new Set(g.tables.map((t) => t.name.toLowerCase()));
  const syms = new Set(g.symbols.flatMap((s) => [s.fqn, s.name]));
  const steps = new Set(g.processes.flatMap((p) => p.steps.map((s) => `${p.name}#${s.n}`)));
  return (ref) => {
    const r = parseRef(ref);
    if (!r) return false;
    switch (r.kind) {
      case 'file': return files.has(r.key);
      case 'req': return reqs.has(r.key);
      case 'rule': return rules.has(r.key);
      case 'table': return tables.has(r.key.toLowerCase());
      case 'sym': return syms.has(r.key);
      case 'step': return steps.has(r.key);
      default: return false;
    }
  };
}

/**
 * Recompute everything imported data links to, against a snapshot: incident file paths (suffix match), ticket->commit
 * links, per-file incident counts, and manual-edge resolution flags.
 */
export async function refreshLinks(ctx: Ctx, sourceId: string, snapshotId: string, unresolvedEdgeIds: string[] = [], resolvedEdgeIds: string[] = []) {
  const db = ctx.db;
  const [files, commits, incidents, tickets] = await Promise.all([
    db.file.findMany({ where: { snapshotId }, select: { path: true } }),
    db.commit.findMany({ where: { snapshotId }, select: { sha: true, subject: true } }),
    db.incident.findMany({ where: { sourceId }, include: { files: true } }),
    db.ticket.findMany({ where: { sourceId } }),
  ]);
  const paths = files.map((f) => f.path);
  const perFile = new Map<string, number>();
  for (const inc of incidents) {
    const res = resolvePaths(inc.files.map((f) => f.path), paths);
    await Promise.all(inc.files.map((f, i) => db.incidentFile.update({ where: { id: f.id }, data: { resolvedPath: res[i]!.resolved ?? null, ambiguous: res[i]!.ambiguous ?? [] } })));
    for (const r of new Set(res.map((x) => x.resolved).filter(Boolean) as string[])) perFile.set(r, (perFile.get(r) ?? 0) + 1);
  }
  for (const t of tickets) {
    const sha = linkTicketCommit({ key: t.key, taskmanager: t.taskmanager ?? '', type: t.type ?? '', title: t.title, status: t.status ?? '', note: t.note ?? '', reqs: t.reqs, commitRef: t.commitRef ?? '' }, commits);
    if (sha !== t.commitSha) await db.ticket.update({ where: { id: t.id }, data: { commitSha: sha } });
  }
  await db.fileMetric.updateMany({ where: { snapshotId }, data: { incidents: 0 } });
  await Promise.all([...perFile].map(([path, n]) => db.fileMetric.updateMany({ where: { snapshotId, path }, data: { incidents: n } })));
  if (resolvedEdgeIds.length) await db.manualEdge.updateMany({ where: { id: { in: resolvedEdgeIds } }, data: { unresolvedSince: null } });
  if (unresolvedEdgeIds.length) await db.manualEdge.updateMany({ where: { id: { in: unresolvedEdgeIds }, unresolvedSince: null }, data: { unresolvedSince: ctx.now() } });
}

export async function loadOverlayInput(ctx: Ctx, sourceId: string): Promise<OverlayInput> {
  const [cps, edges] = await Promise.all([
    ctx.db.customProcess.findMany({ where: { sourceId }, include: { steps: { orderBy: { n: 'asc' } } }, orderBy: { createdAt: 'asc' } }),
    ctx.db.manualEdge.findMany({ where: { sourceId }, orderBy: { createdAt: 'asc' } }),
  ]);
  return {
    customProcesses: cps.map((c) => ({ id: c.id, name: c.name, description: c.description, steps: c.steps.map((s) => ({ n: s.n, name: s.name, requirement: s.requirement })) })),
    manualEdges: edges.map((e) => ({ id: e.id, type: e.type, fromRef: e.fromRef, toRef: e.toRef, note: e.note, createdBy: e.createdBy, createdAt: e.createdAt })),
  };
}
