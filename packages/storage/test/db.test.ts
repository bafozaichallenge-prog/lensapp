import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { extractFacts, diffFacts, formatDiff } from '@lens/graph';
import { loadFixture } from '../../../test/helpers/fixture';
import { DatabaseStorage, MemoryStorage, saveAndActivateSnapshot, loadGraph, loadFileTexts, activeSnapshot } from '../src';

const url = process.env.DATABASE_URL;
const db = url ? new PrismaClient({ datasources: { db: { url } } }) : null;
const reachable = db ? await db.$queryRaw`SELECT 1`.then(() => true, () => false) : false;

describe.skipIf(!reachable)('PostgreSQL persistence (needs DATABASE_URL and a migrated database)', () => {
  const tag = `t${Date.now()}`;
  let fx: Awaited<ReturnType<typeof loadFixture>>;
  const storage = new DatabaseStorage(db!);
  const mkSource = (n: string) => db!.source.create({ data: { name: `${tag}-${n}`, vertical: 'Test', gitlabProjectId: Math.floor(Math.random() * 1e9), pathWithNamespace: `x/${n}`, branch: 'main' } });
  const save = (sourceId: string, sha: string, graph = fx.graph, files = fx.source) =>
    saveAndActivateSnapshot(db!, storage, { sourceId, sha, graph, files, commits: fx.commits });

  beforeAll(async () => { fx = await loadFixture(); });
  afterAll(async () => {
    // projects (and their analyses) reference sources and snapshots without cascade, so remove them first
    await db!.changeProject.deleteMany({ where: { source: { name: { startsWith: tag } } } });
    await db!.source.deleteMany({ where: { name: { startsWith: tag } } });
    await db!.user.deleteMany({ where: { email: { startsWith: tag } } });
    await db!.$disconnect();
  });

  it('stores a snapshot and reads back exactly the same graph', async () => {
    const s = await mkSource('roundtrip');
    const r = await save(s.id, 'sha-1');
    expect(r.ok, r.issues.join()).toBe(true);
    const back = await loadGraph(db!, r.snapshotId);
    const d = diffFacts(extractFacts(fx.graph), extractFacts(back));
    expect(d, formatDiff(d)).toEqual({ missing: [], unexpected: [] });
    expect((await activeSnapshot(db!, s.id))!.id).toBe(r.snapshotId);
    expect((await db!.source.findUnique({ where: { id: s.id } }))!.lastSha).toBe('sha-1');
  });

  it('round-trips file contents through the storage abstraction', async () => {
    const s = await mkSource('content'); const r = await save(s.id, 'sha-1');
    const texts = await loadFileTexts(db!, storage, r.snapshotId);
    expect(texts.find((f) => f.path.endsWith('CollectionInstruction.cls'))!.text).toBe(fx.source.find((f) => f.path.endsWith('CollectionInstruction.cls'))!.text);
  });

  it('activating a new snapshot supersedes the old one atomically and deduplicates unchanged content', async () => {
    const s = await mkSource('swap');
    const a = await save(s.id, 'sha-1');
    const blobsAfterA = await db!.blob.count();
    const b = await save(s.id, 'sha-2');
    expect(await db!.blob.count()).toBe(blobsAfterA); // identical files: nothing new stored
    const all = await db!.graphSnapshot.findMany({ where: { sourceId: s.id } });
    expect(all.filter((x) => x.status === 'ACTIVE').map((x) => x.id)).toEqual([b.snapshotId]);
    expect(all.find((x) => x.id === a.snapshotId)!.status).toBe('SUPERSEDED');
    // the superseded snapshot is still fully readable (historical analyses stay reproducible)
    expect((await loadGraph(db!, a.snapshotId)).files).toHaveLength(fx.graph.files.length);
  });

  it('a snapshot that fails validation never replaces the active one', async () => {
    const s = await mkSource('fail');
    const good = await save(s.id, 'sha-1');
    const tiny = { ...fx.graph, files: fx.graph.files.slice(0, 3), edges: [], symbols: [], processes: [], metrics: [], requirements: [], ruleCodes: [], tables: [] };
    const bad = await save(s.id, 'sha-2', tiny);
    expect(bad.ok).toBe(false);
    expect((await activeSnapshot(db!, s.id))!.id).toBe(good.snapshotId);
    expect((await db!.graphSnapshot.findUnique({ where: { id: bad.snapshotId } }))!.status).toBe('FAILED');
  });

  it('the database itself refuses two ACTIVE snapshots for one source', async () => {
    const s = await mkSource('one-active');
    await save(s.id, 'sha-1');
    await expect(db!.graphSnapshot.create({ data: { sourceId: s.id, sha: 'x', status: 'ACTIVE' } })).rejects.toThrow();
  });

  it('the database refuses a second in-flight sync run for one source', async () => {
    const s = await mkSource('inflight');
    await db!.syncRun.create({ data: { sourceId: s.id, status: 'QUEUED' } });
    await expect(db!.syncRun.create({ data: { sourceId: s.id, status: 'QUEUED' } })).rejects.toThrow();
    await db!.syncRun.updateMany({ where: { sourceId: s.id }, data: { status: 'DONE' } });
    await expect(db!.syncRun.create({ data: { sourceId: s.id, status: 'QUEUED' } })).resolves.toBeTruthy();
  });

  it('rows of an ACTIVE snapshot cannot be edited in place; edge confidence is range-checked', async () => {
    const s = await mkSource('immutable'); const r = await save(s.id, 'sha-1');
    await expect(db!.file.updateMany({ where: { snapshotId: r.snapshotId }, data: { loc: 1 } })).rejects.toThrow(/immutable/);
    await expect(db!.edge.updateMany({ where: { snapshotId: r.snapshotId }, data: { confidence: 0.1 } })).rejects.toThrow(/immutable/);
    const b = await db!.graphSnapshot.create({ data: { sourceId: s.id, sha: 'b', status: 'BUILDING' } });
    await expect(db!.edge.create({ data: { snapshotId: b.id, fromRef: 'file:a', toRef: 'file:b', type: 'uses', origin: 'EXPLICIT', confidence: 1.5 } })).rejects.toThrow();
  });

  it('a finished analysis is immutable and stays pinned to its snapshot after later syncs', async () => {
    const s = await mkSource('analysis'); const a = await save(s.id, 'sha-1');
    const admin = await db!.user.create({ data: { email: `${tag}@example.test`, role: 'ADMIN' } });
    const p = await db!.changeProject.create({ data: { name: 'p', description: 'd', sourceId: s.id, createdBy: admin.id } });
    const an = await db!.analysis.create({ data: { changeProjectId: p.id, version: 1, status: 'RUNNING', sourceId: s.id, graphSnapshotId: a.snapshotId, sha: 'sha-1', impactJson: {}, inputDocumentVersionIds: [] } });
    await db!.analysis.update({ where: { id: an.id }, data: { status: 'DONE', resultJson: { ok: true } } });
    await expect(db!.analysis.update({ where: { id: an.id }, data: { resultJson: { ok: false } } })).rejects.toThrow(/finished/);
    await save(s.id, 'sha-2');
    const again = await db!.analysis.findUnique({ where: { id: an.id }, include: { snapshot: true } });
    expect(again!.snapshot.sha).toBe('sha-1'); expect(again!.snapshot.status).toBe('SUPERSEDED');
  });

  it('DatabaseStorage deduplicates by content hash', async () => {
    const b = new TextEncoder().encode(`unique-${tag}`);
    const k1 = await storage.put(b), k2 = await storage.put(b);
    expect(k1.key).toBe(k2.key);
    expect(new TextDecoder().decode((await storage.get(k1.key))!)).toBe(`unique-${tag}`);
    expect(await storage.has('nope')).toBe(false);
    const m = new MemoryStorage(); await m.put(b); await m.put(b); expect(m.size).toBe(1);
  });
});
