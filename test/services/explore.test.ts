/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  previewImport, runImport, unresolvedIncidentFiles, overview, processDetail, history, entity, search, loadModel, sourceBanner, ServiceError, suggestMapping, type Actor,
} from '@lens/services';
import { db, dbReachable, makeEnv, type Env } from '../helpers/services';

const P = 'NewBusiness/';
const csv = (n: string) => fs.readFileSync(path.resolve(__dirname, '../fixtures/bafoz/exports', n), 'utf8');

describe.skipIf(!dbReachable)('imports and Explore (real database)', () => {
  let env: Env; let src: { id: string }; let maint: Actor, admin: Actor, viewer: Actor;
  beforeAll(async () => {
    env = await makeEnv();
    src = await env.source();
    maint = await env.user('MAINTAINER'); admin = env.admin; viewer = await env.user('VIEWER');
    await env.syncNow(src.id);
  });
  afterAll(async () => { await env.cleanup(); await db!.$disconnect(); });

  describe('CSV import', () => {
    it('suggests a column mapping from headers and reports missing required fields', async () => {
      const pv = await previewImport(env.ctx, maint, src.id, 'incidents', csv('incidents.csv'));
      expect(pv.mapping).toMatchObject({ key: 'id', title: 'title', files: 'files', severity: 'sev', rootCause: 'root', fixTicket: 'fix' });
      expect(pv.missingRequired).toEqual([]);
      expect(pv.rows).toBe(5);
      expect(suggestMapping('tickets', ['ticket', 'name']).key).toBe('ticket');
      expect((await previewImport(env.ctx, maint, src.id, 'tickets', 'a,b\n1,2\n')).missingRequired).toEqual(['key', 'title']);
    });

    it('imports the prototype sample data: tickets link to commits (NBJ-127 -> 7b94784)', async () => {
      const pv = await previewImport(env.ctx, maint, src.id, 'tickets', csv('jira-taskmanager-tickets.csv'));
      const r = await runImport(env.ctx, maint, src.id, 'tickets', csv('jira-taskmanager-tickets.csv'), pv.mapping);
      expect(r).toMatchObject({ created: 7, updated: 0, droppedColumns: [] });
      const t = await db!.ticket.findUnique({ where: { sourceId_key: { sourceId: src.id, key: 'NBJ-127' } } });
      expect(t!.commitSha!.startsWith('7b94784')).toBe(true);
      // re-importing is idempotent (upsert)
      const again = await runImport(env.ctx, maint, src.id, 'tickets', csv('jira-taskmanager-tickets.csv'), pv.mapping);
      expect(again).toMatchObject({ created: 0, updated: 7 });
    });

    it('imports incidents with paths resolved by suffix; the mapping is remembered per source and kind', async () => {
      const pv = await previewImport(env.ctx, maint, src.id, 'incidents', csv('incidents.csv'));
      const r = await runImport(env.ctx, maint, src.id, 'incidents', csv('incidents.csv'), pv.mapping);
      expect(r.created).toBe(5);
      expect(r.unresolvedPaths).toEqual([]);
      const f = await db!.incidentFile.findFirst({ where: { incident: { sourceId: src.id, key: 'INC-2291' } }, orderBy: { path: 'asc' } });
      expect(f!.resolvedPath).toBe(`${P}src/domain/entities/CollectionInstruction.cls`);
      const saved = await previewImport(env.ctx, maint, src.id, 'incidents', csv('incidents.csv').replace('id,sev', 'incident_id,sev'));
      expect(saved.mapping.key).toBeUndefined(); // header renamed: the saved column no longer exists, so it is not applied
      expect((await previewImport(env.ctx, maint, src.id, 'incidents', csv('incidents.csv'))).mapping.key).toBe('id');
    });

    it('reports unresolved and ambiguous file references after import so users can correct them', async () => {
      const text = 'id,title,files\nINC-9001,Ghost,src/Nope.cls;src/domain/entities/CollectionInstruction.cls\nINC-9002,Amb,Contract.cls\n';
      const r = await runImport(env.ctx, maint, src.id, 'incidents', text, { key: 'id', title: 'title', files: 'files' });
      expect(r.unresolvedPaths).toEqual([{ incident: 'INC-9001', path: 'src/Nope.cls' }]);
      const un = await unresolvedIncidentFiles(env.ctx, viewer, src.id);
      expect(un.some((x) => x.incident === 'INC-9001' && x.path === 'src/Nope.cls')).toBe(true);
      // fix it by re-importing with a real path
      await runImport(env.ctx, maint, src.id, 'incidents', 'id,title,files\nINC-9001,Ghost,src/domain/entities/Contract.cls\n', { key: 'id', title: 'title', files: 'files' });
      expect((await unresolvedIncidentFiles(env.ctx, viewer, src.id)).some((x) => x.incident === 'INC-9001')).toBe(false);
    });

    it('drops personal-data columns by default and blocks a Maintainer from retaining them; an Admin may', async () => {
      const text = 'id,title,files,reporter email,notes\nINC-7001,Login,src/Bootstrap.cls,jane.doe@corp.co,call 082 123 4567\nINC-7002,Other,src/Bootstrap.cls,joe@corp.co,call 083 765 4321\n';
      const map = { key: 'id', title: 'title', files: 'files', symptom: 'notes' };
      const pv = await previewImport(env.ctx, maint, src.id, 'incidents', text);
      expect(pv.personalData.map((p) => p.column).sort()).toEqual(['notes', 'reporter email']);
      const r = await runImport(env.ctx, maint, src.id, 'incidents', text, map);
      expect(r.droppedColumns.sort()).toEqual(['notes', 'reporter email']);
      const row = await db!.incident.findUnique({ where: { sourceId_key: { sourceId: src.id, key: 'INC-7001' } } });
      expect(row!.symptom).toBeNull();
      expect(JSON.stringify(row)).not.toMatch(/jane\.doe|082 123/);
      await expect(runImport(env.ctx, maint, src.id, 'incidents', text, map, { retainColumns: ['notes'] })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      const ra = await runImport(env.ctx, admin, src.id, 'incidents', text, map, { retainColumns: ['notes'] });
      expect(ra.retainedColumns).toEqual(['notes']);
      expect((await db!.incident.findUnique({ where: { sourceId_key: { sourceId: src.id, key: 'INC-7001' } } }))!.symptom).toContain('082');
      await db!.incident.deleteMany({ where: { sourceId: src.id, key: { in: ['INC-7001', 'INC-7002'] } } });
    });

    it('explains when a required column was dropped as personal data', async () => {
      const text = 'id,title,files\nX-1,jane@corp.co,src/Bootstrap.cls\nX-2,joe@corp.co,src/Bootstrap.cls\n';
      await expect(runImport(env.ctx, maint, src.id, 'incidents', text, { key: 'id', title: 'title', files: 'files' })).rejects.toThrow(/personal data/);
    });

    it('viewers cannot import; unmapped or unknown columns are rejected', async () => {
      await expect(runImport(env.ctx, viewer, src.id, 'tickets', 'id,title\n1,2\n', { key: 'id', title: 'title' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(runImport(env.ctx, maint, src.id, 'tickets', 'id,title\n1,2\n', { key: 'nope', title: 'title' })).rejects.toBeInstanceOf(ServiceError);
    });

    it('imports are audited without row contents', async () => {
      const logs = await db!.auditLog.findMany({ where: { action: 'import.run', targetId: src.id } });
      expect(logs.length).toBeGreaterThan(3);
      expect(JSON.stringify(logs)).not.toMatch(/jane\.doe|Ghost/);
    });
  });

  describe('Explore', () => {
    it('overview groups processes by vertical with steps, changes, incident counts and last activity', async () => {
      const o = await overview(env.ctx, viewer);
      const g = o.verticals.find((v) => v.vertical === 'Personal Insurance')!;
      const p = g.processes.find((x) => x.name === 'New Business Process' && x.sourceId === src.id)!;
      expect(p).toMatchObject({ steps: 7 });
      expect(p.changes).toBeGreaterThan(0);
      expect(p.incidents).toBeGreaterThanOrEqual(2);
      expect(p.openIncidents).toBeGreaterThanOrEqual(1);
      expect(p.lastActivity).toBeTruthy();
      const b = o.sources.find((s) => s.sourceId === src.id)!;
      expect(b.shortSha).toHaveLength(7);
      expect(b.syncedAt).toBeInstanceOf(Date);
    });

    it('process page: step 5 has its files, rules and INC-2291; the timeline tags the steps a commit touched', async () => {
      const d = await processDetail(env.ctx, viewer, src.id, 'New Business Process');
      const s5 = d.steps[4]!;
      expect(s5.requirement).toMatchObject({ code: 'BR-005' });
      expect(s5.files.some((f) => f.endsWith('CollectionInstruction.cls'))).toBe(true);
      expect(s5.files.some((f) => f.endsWith('CollectionService.cls'))).toBe(true);
      expect(s5.rules).toEqual(['NB-COLLECTION-001', 'NB-COLLECTION-002']);
      expect(s5.incidents).toContain('INC-2291');
      const fix = d.timeline.find((c) => c.short === '7b94784')!;
      expect(fix.steps).toContain(5);
      expect(fix.ticket).toBe('NBJ-127');
      expect(fix.branch).toBe('bugfix/collection-day-monthly-validity');
    });

    it('every inferred relationship exposes its origin, confidence and reason (evidence)', async () => {
      const d = await processDetail(env.ctx, viewer, src.id, 'New Business Process');
      const inferred = d.steps.flatMap((s) => s.relationships).filter((r) => r.origin === 'INFERRED');
      expect(inferred.length).toBeGreaterThan(20);
      for (const r of inferred) { expect(r.confidence).toBeGreaterThan(0); expect(r.confidence).toBeLessThanOrEqual(1); expect(r.reason).toBeTruthy(); }
    });

    it('history: INC-2291 is placed on step 5 of its process, INC-2318 is listed as unlinked', async () => {
      const h = await history(env.ctx, viewer);
      const panel = h.panels.find((p) => p.sourceId === src.id && p.process === 'New Business Process')!;
      expect(panel.incidents.find((i) => i.key === 'INC-2291')!.steps).toContain(5);
      expect(h.unlinked.find((u) => u.sourceId === src.id && u.key === 'INC-2318')).toBeTruthy();
      expect(h.panels.map((p) => p.incidents.length)).toEqual([...h.panels.map((p) => p.incidents.length)].sort((a, b) => b - a));
    });

    it('entity pages: class (dependencies, dependents, tests, history, code), requirement, rule, table, step, ticket, incident, commit', async () => {
      const cls = await entity(env.ctx, viewer, src.id, 'file', `${P}src/domain/entities/CollectionInstruction.cls`, { includeCode: true }) as any;
      expect(cls.symbol.methods).toContain('Validate');
      expect(cls.dependents.length).toBeGreaterThan(0);
      expect(cls.directTests.length).toBeGreaterThan(0);
      expect(cls.tables.map((t: any) => t.type)).toContain('mirrors');
      expect(cls.history.some((c: any) => c.short === '7b94784')).toBe(true);
      expect(cls.incidents.map((i: any) => i.key)).toContain('INC-2291');
      expect(cls.code).toContain('CLASS');
      expect(cls.metrics).toMatchObject({ churn: expect.any(Number) });
      const req = await entity(env.ctx, viewer, src.id, 'requirement', 'BR-005') as any;
      expect(req.requirement.title).toBe('Capture Collection Details');
      expect(req.steps.map((s: any) => s.origin)).toContain('INFERRED');
      const rule = await entity(env.ctx, viewer, src.id, 'rule', 'NB-COLLECTION-002') as any;
      expect(rule.ruleCode.impl).toBeTruthy(); expect(rule.implementedBy.length).toBeGreaterThan(0);
      const tbl = await entity(env.ctx, viewer, src.id, 'table', 'CollectionInstruction') as any;
      expect(tbl.table.fields).toHaveLength(6); expect(tbl.usedBy.length + tbl.mirroredBy.length).toBeGreaterThan(0);
      const step = await entity(env.ctx, viewer, src.id, 'step', 'New Business Process#5') as any;
      expect(step.relationships.some((r: any) => r.type === 'maps-step-file')).toBe(true);
      expect(step.incidents.map((i: any) => i.key)).toContain('INC-2291');
      expect(((await entity(env.ctx, viewer, src.id, 'ticket', 'NBJ-127')) as any).commit.short).toBe('7b94784');
      expect(((await entity(env.ctx, viewer, src.id, 'incident', 'INC-2291')) as any).steps.length).toBeGreaterThan(0);
      expect(((await entity(env.ctx, viewer, src.id, 'commit', '7b94784')) as any).ticket.key).toBe('NBJ-127');
      await expect(entity(env.ctx, viewer, src.id, 'file', 'nope.cls')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('search finds classes, requirements, rules, tables, tickets, incidents and commits', async () => {
      const kinds = async (q: string) => new Set((await search(env.ctx, viewer, q)).filter((r) => r.sourceId === src.id).map((r) => r.kind));
      expect([...(await kinds('collection'))]).toEqual(expect.arrayContaining(['file', 'requirement', 'rule', 'table', 'incident', 'commit']));
      expect((await kinds('NBJ-127')).has('ticket')).toBe(true);
      expect((await kinds('INC-2291')).has('incident')).toBe(true);
      expect((await kinds('7b94784')).has('commit')).toBe(true);
      expect(await search(env.ctx, viewer, 'x')).toEqual([]);
    });

    it('sources the user cannot read are invisible in every Explore query', async () => {
      const outsider = await env.user('ADMIN', { gitlab: false });
      expect((await overview(env.ctx, outsider)).sources.map((s) => s.sourceId)).not.toContain(src.id);
      expect((await history(env.ctx, outsider)).panels.filter((p) => p.sourceId === src.id)).toHaveLength(0);
      expect((await search(env.ctx, outsider, 'collection')).filter((r) => r.sourceId === src.id)).toHaveLength(0);
      await expect(processDetail(env.ctx, outsider, src.id, 'New Business Process')).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(entity(env.ctx, outsider, src.id, 'ticket', 'NBJ-127')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('every source view carries the active SHA and sync time', async () => {
      const m = await loadModel(env.ctx, src.id);
      expect(sourceBanner(m)).toMatchObject({ shortSha: 'aaaaaaa', syncedAt: expect.any(Date) });
    });
  });
});
