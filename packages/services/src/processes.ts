import type { Prisma } from '@prisma/client';
import type { EdgeType, Edge, ProcessNode } from '@lens/core';
import { loadGraph } from '@lens/storage';
import { mapProcessAgainstGraph, parseStepLines } from '@lens/ingest';
import { audit } from './audit';
import { badRequest, notFound, type Actor, type Ctx } from './context';
import { requireSource } from './access';
import { forgetSnapshot } from './model';
import { refResolver } from './overlays';

async function activeSnapshotId(ctx: Ctx, sourceId: string) {
  const s = await ctx.db.graphSnapshot.findFirst({ where: { sourceId, status: 'ACTIVE' } });
  if (!s) throw badRequest('This source has not been synced yet.');
  return s.id;
}

const edgeRows = (snapshotId: string, edges: Edge[]) => edges.map((e) => ({ snapshotId, fromRef: e.from, toRef: e.to, type: e.type, origin: e.origin, confidence: e.confidence, evidenceJson: (e.evidence ?? undefined) as Prisma.InputJsonValue | undefined }));

/**
 * Add a custom process (Maintainer+). Steps map to code with the same heuristics as ingestion. The definition is stored
 * against the source, so every future sync re-projects it; it is also projected into the active snapshot now.
 */
export async function addCustomProcess(ctx: Ctx, actor: Actor, sourceId: string, i: { name: string; description?: string; steps: string }) {
  await requireSource(ctx, actor, 'process.manage', sourceId);
  const name = i.name.trim();
  if (name.length < 2 || name.length > 80) throw badRequest('Give the process a name (2 to 80 characters).');
  const steps = parseStepLines(i.steps);
  if (steps.length < 2) throw badRequest('Add at least two steps, one per line.');
  if (steps.length > 40) throw badRequest('A process can have at most 40 steps.');
  const snapId = await activeSnapshotId(ctx, sourceId);
  const graph = await loadGraph(ctx.db, snapId);
  if (graph.processes.some((p) => p.name.toLowerCase() === name.toLowerCase())) throw badRequest('A process with that name already exists in this system.');
  const cp = await ctx.db.customProcess.create({ data: { sourceId, name, description: i.description?.trim() || null, createdBy: actor.id, steps: { create: steps.map((s) => ({ n: s.n, name: s.name, requirement: s.requirement ?? null })) } } });
  const node: ProcessNode = { name, origin: 'MANUAL', description: cp.description ?? undefined, steps };
  const edges = mapProcessAgainstGraph(graph, node).map((e) => (e.origin === 'EXPLICIT' ? { ...e, origin: 'MANUAL' as const } : e));
  await ctx.db.snapshotProcess.create({ data: { snapshotId: snapId, name, origin: 'MANUAL', description: node.description ?? null, customId: cp.id, steps: { create: steps.map((s) => ({ n: s.n, name: s.name, requirement: s.requirement ?? null })) } } });
  await ctx.db.edge.createMany({ data: edgeRows(snapId, edges), skipDuplicates: true });
  forgetSnapshot(snapId);
  await audit(ctx, actor.id, 'process.create', { type: 'process', id: cp.id }, { sourceId, name, steps: steps.length });
  return cp;
}

export async function removeCustomProcess(ctx: Ctx, actor: Actor, sourceId: string, customProcessId: string) {
  await requireSource(ctx, actor, 'process.manage', sourceId);
  const cp = await ctx.db.customProcess.findFirst({ where: { id: customProcessId, sourceId } });
  if (!cp) throw notFound('Custom process not found.');
  const snapId = await activeSnapshotId(ctx, sourceId);
  await ctx.db.$transaction([
    ctx.db.edge.deleteMany({ where: { snapshotId: snapId, fromRef: { startsWith: `step:${cp.name}#` } } }),
    ctx.db.snapshotProcess.deleteMany({ where: { snapshotId: snapId, name: cp.name, origin: 'MANUAL' } }),
    ctx.db.customProcess.delete({ where: { id: cp.id } }),
  ]);
  forgetSnapshot(snapId);
  await audit(ctx, actor.id, 'process.remove', { type: 'process', id: cp.id }, { sourceId, name: cp.name });
}

/** A user-made relationship (origin MANUAL). Kept across syncs; flagged as unresolved if an end disappears. */
export async function addManualEdge(ctx: Ctx, actor: Actor, sourceId: string, i: { type: EdgeType; fromRef: string; toRef: string; note?: string }) {
  await requireSource(ctx, actor, 'process.manage', sourceId);
  const snapId = await activeSnapshotId(ctx, sourceId);
  const graph = await loadGraph(ctx.db, snapId);
  const ok = refResolver(graph);
  if (!ok(i.fromRef) || !ok(i.toRef)) throw badRequest('Both ends must exist in the current snapshot.');
  const me = await ctx.db.manualEdge.upsert({ where: { sourceId_type_fromRef_toRef: { sourceId, type: i.type, fromRef: i.fromRef, toRef: i.toRef } }, create: { sourceId, type: i.type, fromRef: i.fromRef, toRef: i.toRef, note: i.note ?? null, createdBy: actor.id }, update: { note: i.note ?? null } });
  await ctx.db.edge.upsert({
    where: { snapshotId_type_fromRef_toRef: { snapshotId: snapId, type: i.type, fromRef: i.fromRef, toRef: i.toRef } },
    create: { snapshotId: snapId, type: i.type, fromRef: i.fromRef, toRef: i.toRef, origin: 'MANUAL', confidence: 1, evidenceJson: { reason: i.note ? `manual mapping: ${i.note}` : 'manual mapping', refs: [`user:${actor.id}`] } },
    update: { origin: 'MANUAL', confidence: 1 },
  }).catch(() => undefined); // an existing derived edge in an active snapshot is immutable; the overlay applies from the next sync
  forgetSnapshot(snapId);
  await audit(ctx, actor.id, 'process.update', { type: 'edge', id: me.id }, { sourceId, type: i.type, from: i.fromRef, to: i.toRef });
  return me;
}

export async function removeManualEdge(ctx: Ctx, actor: Actor, sourceId: string, edgeId: string) {
  await requireSource(ctx, actor, 'process.manage', sourceId);
  const me = await ctx.db.manualEdge.findFirst({ where: { id: edgeId, sourceId } });
  if (!me) throw notFound('Mapping not found.');
  const snapId = await activeSnapshotId(ctx, sourceId);
  await ctx.db.$transaction([
    ctx.db.edge.deleteMany({ where: { snapshotId: snapId, type: me.type, fromRef: me.fromRef, toRef: me.toRef, origin: 'MANUAL' } }),
    ctx.db.manualEdge.delete({ where: { id: me.id } }),
  ]);
  forgetSnapshot(snapId);
  await audit(ctx, actor.id, 'process.update', { type: 'edge', id: me.id }, { sourceId, removed: true });
}

/** Manual edges whose ends no longer resolve after a sync: shown for review, never silently dropped. */
export async function unresolvedManualEdges(ctx: Ctx, actor: Actor, sourceId: string) {
  await requireSource(ctx, actor, 'source.view', sourceId);
  return ctx.db.manualEdge.findMany({ where: { sourceId, unresolvedSince: { not: null } } });
}
