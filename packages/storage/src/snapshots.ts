import type { Prisma, PrismaClient } from '@prisma/client';
import type { CommitInput, GraphInput, SourceFile } from '@lens/core';
import { validateGraph, hasErrors } from '@lens/graph';
import { commitRefs } from '@lens/ingest';
import type { ArtifactStorage } from './artifact';
import { sha256Hex } from './artifact';

const chunks = <T>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const enc = new TextEncoder();

export interface SaveInput { sourceId: string; sha: string; syncRunId?: string; graph: GraphInput; files: SourceFile[]; commits: CommitInput[] }

/**
 * Persist a parsed graph as a BUILDING snapshot, then validate and activate it in one transaction.
 * If anything fails the snapshot is marked FAILED and the previously ACTIVE snapshot is untouched.
 */
export async function saveAndActivateSnapshot(db: PrismaClient, storage: ArtifactStorage, i: SaveInput): Promise<{ snapshotId: string; ok: boolean; issues: string[] }> {
  const snap = await db.graphSnapshot.create({ data: { sourceId: i.sourceId, sha: i.sha, syncRunId: i.syncRunId, status: 'BUILDING' } });
  try {
    const prev = await db.graphSnapshot.findFirst({ where: { sourceId: i.sourceId, status: 'ACTIVE' }, include: { _count: { select: { files: true } } } });
    const issues = validateGraph(i.graph, prev ? { files: prev._count.files } : undefined);
    if (hasErrors(issues)) {
      await db.graphSnapshot.update({ where: { id: snap.id }, data: { status: 'FAILED', issuesJson: issues as unknown as Prisma.InputJsonValue } });
      return { snapshotId: snap.id, ok: false, issues: issues.map((x) => x.message) };
    }
    const g = i.graph, sid = snap.id;
    const text = new Map(i.files.map((f) => [f.path, f.text]));

    // content-addressed blobs (deduplicated across snapshots)
    const blobOf = new Map<string, string>();
    for (const f of g.files) {
      const t = text.get(f.path);
      if (t == null) continue;
      blobOf.set(f.path, (await storage.put(enc.encode(t))).sha256);
    }
    await db.file.createMany({ data: g.files.map((f) => ({ snapshotId: sid, path: f.path, blobSha: blobOf.get(f.path) ?? null, kind: f.kind, layer: f.layer ?? null, loc: f.loc, header: f.header ?? null, isTest: f.isTest })) });
    await db.symbol.createMany({ data: g.symbols.map((s) => ({ snapshotId: sid, filePath: s.file, fqn: s.fqn, name: s.name, classKind: s.classKind, inherits: s.inherits ?? null, implements: s.implements, methods: s.methods, tests: s.tests })) });
    for (const c of chunks(g.edges, 2000)) await db.edge.createMany({ data: c.map((e) => ({ snapshotId: sid, fromRef: e.from, toRef: e.to, type: e.type, origin: e.origin, confidence: e.confidence, evidenceJson: (e.evidence ?? undefined) as Prisma.InputJsonValue | undefined })), skipDuplicates: true });
    for (const t of g.tables) await db.dbTable.create({ data: { snapshotId: sid, name: t.name, type: t.type, addedIn: t.addedIn, fields: { create: t.fields.map((f) => ({ name: f.name, type: f.type, addedIn: f.addedIn })) } } });
    await db.requirement.createMany({ data: g.requirements.map((r) => ({ snapshotId: sid, code: r.code, kind: r.kind, title: r.title, body: r.body, docPath: r.docPath, orderIdx: r.order })) });
    await db.ruleCode.createMany({ data: g.ruleCodes.map((r) => ({ snapshotId: sid, code: r.code, impl: r.impl, trace: r.trace })) });
    for (const p of g.processes) await db.snapshotProcess.create({ data: { snapshotId: sid, name: p.name, origin: p.origin, description: p.description ?? null, docPath: p.docPath ?? null, steps: { create: p.steps.map((s) => ({ n: s.n, name: s.name, requirement: s.requirement ?? null })) } } });
    for (const c of i.commits) await db.commit.create({ data: { snapshotId: sid, sha: c.sha, short: c.sha.slice(0, 7), author: c.author, date: new Date(c.date), subject: c.subject, parents: c.parents, branch: c.branch ?? null, refs: commitRefs(c.subject), files: { create: c.files.map((f) => ({ path: f.path, additions: f.additions, deletions: f.deletions })) } } });
    await db.fileMetric.createMany({ data: g.metrics.map((m) => ({ snapshotId: sid, path: m.path, loc: m.loc, churn: m.churn, incidents: m.incidents, fanIn: m.fanIn, directTests: m.directTests })) });

    // atomic swap: previous ACTIVE -> SUPERSEDED, new -> ACTIVE (the partial unique index enforces "only one")
    await db.$transaction([
      db.graphSnapshot.updateMany({ where: { sourceId: i.sourceId, status: 'ACTIVE' }, data: { status: 'SUPERSEDED' } }),
      db.graphSnapshot.update({ where: { id: sid }, data: { status: 'ACTIVE', activatedAt: new Date(), issuesJson: issues as unknown as Prisma.InputJsonValue } }),
      db.source.update({ where: { id: i.sourceId }, data: { lastSha: i.sha, lastCommitDate: i.commits.length ? new Date(i.commits[i.commits.length - 1]!.date) : undefined } }),
    ]);
    return { snapshotId: sid, ok: true, issues: issues.map((x) => x.message) };
  } catch (e) {
    await db.graphSnapshot.update({ where: { id: snap.id }, data: { status: 'FAILED', issuesJson: [{ level: 'error', message: (e as Error).message }] } }).catch(() => {});
    return { snapshotId: snap.id, ok: false, issues: [(e as Error).message] };
  }
}

export async function activeSnapshot(db: PrismaClient, sourceId: string) {
  return db.graphSnapshot.findFirst({ where: { sourceId, status: 'ACTIVE' } });
}

/** Rebuild a GraphInput from a stored snapshot (active or historical). */
export async function loadGraph(db: PrismaClient, snapshotId: string): Promise<GraphInput> {
  const [files, symbols, edges, tables, reqs, rules, procs, metrics] = await Promise.all([
    db.file.findMany({ where: { snapshotId }, orderBy: { path: 'asc' } }),
    db.symbol.findMany({ where: { snapshotId }, orderBy: { fqn: 'asc' } }),
    db.edge.findMany({ where: { snapshotId } }),
    db.dbTable.findMany({ where: { snapshotId }, include: { fields: true }, orderBy: { name: 'asc' } }),
    db.requirement.findMany({ where: { snapshotId }, orderBy: { code: 'asc' } }),
    db.ruleCode.findMany({ where: { snapshotId }, orderBy: { code: 'asc' } }),
    db.snapshotProcess.findMany({ where: { snapshotId }, include: { steps: { orderBy: { n: 'asc' } } }, orderBy: { name: 'asc' } }),
    db.fileMetric.findMany({ where: { snapshotId } }),
  ]);
  const ord = (a: { type: string; from: string; to: string }, b: typeof a) => a.type.localeCompare(b.type) || a.from.localeCompare(b.from) || a.to.localeCompare(b.to);
  return {
    files: files.map((f) => ({ path: f.path, kind: f.kind as never, layer: f.layer ?? undefined, loc: f.loc, header: f.header ?? undefined, isTest: f.isTest })),
    symbols: symbols.map((s) => ({ fqn: s.fqn, name: s.name, file: s.filePath, classKind: s.classKind as never, inherits: s.inherits ?? undefined, implements: s.implements, methods: s.methods, tests: s.tests })),
    edges: edges.map((e) => ({ from: e.fromRef, to: e.toRef, type: e.type as never, origin: e.origin, confidence: e.confidence, evidence: (e.evidenceJson as never) ?? undefined })).sort(ord),
    tables: tables.map((t) => ({ name: t.name, type: t.type as never, addedIn: t.addedIn, fields: t.fields.map((f) => ({ name: f.name, type: f.type, addedIn: f.addedIn })) })),
    requirements: reqs.map((r) => ({ code: r.code, kind: r.kind as never, title: r.title, body: r.body, docPath: r.docPath, order: r.orderIdx })),
    ruleCodes: rules.map((r) => ({ code: r.code, impl: r.impl, trace: r.trace })),
    processes: procs.map((p) => ({ name: p.name, origin: p.origin as never, description: p.description ?? undefined, docPath: p.docPath ?? undefined, steps: p.steps.map((s) => ({ n: s.n, name: s.name, requirement: s.requirement ?? undefined })) })),
    metrics: metrics.map((m) => ({ path: m.path, loc: m.loc, churn: m.churn, incidents: m.incidents, fanIn: m.fanIn, directTests: m.directTests })),
    warnings: [],
  };
}

/** Source file contents for a snapshot, read back through the storage abstraction. */
export async function loadFileTexts(db: PrismaClient, storage: ArtifactStorage, snapshotId: string): Promise<SourceFile[]> {
  const files = await db.file.findMany({ where: { snapshotId, blobSha: { not: null } }, orderBy: { path: 'asc' } });
  const dec = new TextDecoder();
  const out: SourceFile[] = [];
  for (const f of files) { const b = await storage.get(f.blobSha!); if (b) out.push({ path: f.path, text: dec.decode(b), blobSha: f.blobSha! }); }
  return out;
}

export { sha256Hex };
