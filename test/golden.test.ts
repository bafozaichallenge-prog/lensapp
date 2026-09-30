import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import { extractFacts, diffFacts, formatDiff, isEmptyDiff } from '@lens/graph';
import { impactIn, placeIncidents } from '@lens/impact';
import { parseSource } from '@lens/ingest';
import { loadFixture } from './helpers/fixture';

type Fx = Awaited<ReturnType<typeof loadFixture>>;
let fx: Fx;
beforeAll(async () => { fx = await loadFixture(); });

const P = 'NewBusiness/';
const step = (n: number) => `step:New Business Process#${n}`;
const stepEdges = (n: number, type: string) => fx.graph.edges.filter((e) => e.from === step(n) && e.type === type);

describe('golden: BafozAIChallenge-project', () => {
  it('stores 93 ABL source files and 11 non-merge commits', () => {
    expect(fx.source.filter((f) => /\.(cls|p|w|i)$/.test(f.path))).toHaveLength(93);
    expect(fx.commits).toHaveLength(11);
    expect(fx.commits.filter((c) => c.branch).length).toBeGreaterThanOrEqual(8);
    expect(fx.commits.find((c) => c.sha.startsWith('7b94784'))?.branch).toBe('bugfix/collection-day-monthly-validity');
  });

  it('exposes classes, requirements, rules and tables', () => {
    expect(fx.graph.symbols).toHaveLength(89);
    expect(fx.graph.requirements.map((r) => r.code)).toHaveLength(18); // BR-001..007 + BRULE-001..011
    expect(fx.graph.requirements.filter((r) => r.kind === 'requirement').map((r) => r.code)).toEqual(['BR-001', 'BR-002', 'BR-003', 'BR-004', 'BR-005', 'BR-006', 'BR-007']);
    expect(fx.graph.ruleCodes.map((r) => r.code)).toContain('NB-COLLECTION-002');
    const tables = fx.graph.tables.filter((t) => t.type === 'table').map((t) => t.name);
    expect([...tables].sort()).toEqual(['Benefit', 'Campaign', 'CollectionInstruction', 'Contract', 'ContractAudit', 'ContractBenefit', 'Person']);
    expect(fx.graph.tables.find((t) => t.type === 'sequence')?.name).toBe('SeqContract');
  });

  it('applies baseline schema before deltas and records which file introduced each field', () => {
    const benefit = fx.graph.tables.find((t) => t.name === 'Benefit')!;
    const cover = benefit.fields.find((f) => f.name === 'CoverAmount')!;
    expect(cover.addedIn).toContain('database/delta/002_benefit_cover_amount.df');
    expect(benefit.fields[0]!.addedIn).toContain('database/schema/newbusiness.df');
  });

  it('detects the New Business process with 7 steps linked to BR-001..BR-007', () => {
    const p = fx.graph.processes.find((x) => x.name === 'New Business Process')!;
    expect(p.steps).toHaveLength(7);
    for (let n = 1; n <= 7; n++) expect(stepEdges(n, 'maps-step-req')[0]!.to).toBe(`req:BR-00${n}`);
  });

  it('step 5 lists CollectionInstruction, CollectionService and both collection rules', () => {
    const files = stepEdges(5, 'maps-step-file').map((e) => e.to);
    expect(files).toContain(`file:${P}src/domain/entities/CollectionInstruction.cls`);
    expect(files).toContain(`file:${P}src/application/services/CollectionService.cls`);
    expect(stepEdges(5, 'maps-step-rule').map((e) => e.to).sort()).toEqual(['rule:NB-COLLECTION-001', 'rule:NB-COLLECTION-002']);
  });

  it('marks inferred relationships with origin, confidence and evidence', () => {
    for (const e of fx.graph.edges.filter((x) => x.origin === 'INFERRED')) {
      expect(e.confidence).toBeGreaterThan(0);
      expect(e.confidence).toBeLessThanOrEqual(1);
      expect(e.evidence?.reason).toBeTruthy();
    }
    expect(stepEdges(5, 'maps-step-req')[0]).toMatchObject({ origin: 'INFERRED', confidence: 0.9 });
  });

  it('captures key dependencies (inherits, tests, RUN, includes, mirrors)', () => {
    const has = (type: string, from: string, to: string) => fx.graph.edges.some((e) => e.type === type && e.from === `file:${P}${from}` && e.to === to);
    expect(has('mirrors', 'src/domain/entities/CollectionInstruction.cls', 'table:collectioninstruction')).toBe(true);
    expect(has('runs', 'src/Bootstrap.cls', `file:${P}database/seed/SeedData.p`)).toBe(true);
    expect(has('includes', 'src/api/RestGateway.cls', `file:${P}include/ttContractStatus.i`)).toBe(true);
    expect(fx.graph.edges.some((e) => e.type === 'tests' && e.from.startsWith(`file:${P}tests/`))).toBe(true);
  });

  it('links tickets to commits: NBJ-127 -> 7b94784', () => {
    const t = fx.tickets.find((x) => x.key === 'NBJ-127')!;
    expect(t.commit?.startsWith('7b94784')).toBe(true);
  });

  it('places INC-2291 on step 5 and leaves INC-2318 unlinked', () => {
    const { placed, unlinked } = placeIncidents(fx.view);
    expect(placed).toContainEqual({ process: 'New Business Process', step: 5, incident: 'INC-2291' });
    expect(unlinked).toContain('INC-2318');
  });

  it('resolves incident paths by suffix; INC-2318 is unlinked because its files belong to no process step', () => {
    const inc = fx.incidents.find((i) => i.key === 'INC-2291')!;
    expect(inc.resolved.every((r) => r.resolved)).toBe(true);
    expect(inc.resolved[0]!.resolved).toBe(`${P}src/domain/entities/CollectionInstruction.cls`);
    const i2318 = fx.incidents.find((i) => i.key === 'INC-2318')!;
    expect(i2318.resolved.every((r) => r.resolved)).toBe(true);
  });

  it('impact analysis of the worked example matches the prototype', () => {
    const example = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/example-last-day-debit-orders.json'), 'utf8'));
    const r = impactIn(fx.view, example.request);
    expect(r.seeds).toContain(`${P}src/domain/entities/CollectionInstruction.cls`);
    expect(r.incidents).toEqual(['INC-2291']);
    expect(r.processes).toEqual([{ name: 'New Business Process', steps: [5] }]);
    expect(r.tickets).toEqual(['NBJ-101', 'NBJ-127']);
    expect(r.seedDetail[0]!.evidence.length).toBeGreaterThan(0);
  });

  it('is idempotent: the same input yields an identical graph', async () => {
    const again = await parseSource([...fx.source].reverse(), fx.commits);
    expect(again).toEqual(fx.graph);
  });

  it('matches the stored golden facts (diff shows exactly what changed)', () => {
    const file = path.resolve(__dirname, 'fixtures/bafoz.facts.txt');
    const actual = extractFacts(fx.graph);
    if (process.env.UPDATE_GOLDEN || !fs.existsSync(file)) { fs.writeFileSync(file, actual.join('\n') + '\n'); return; }
    const expected = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    const d = diffFacts(expected, actual);
    expect(isEmptyDiff(d), formatDiff(d)).toBe(true);
  });
});
