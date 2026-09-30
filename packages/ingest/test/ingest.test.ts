import { describe, it, expect } from 'vitest';
import {
  decodeSource, stripAbl, parseClass, parseProcedural, parseTableAccess, parseDf, mergeSchemas, parseRequirements, parseRuleCodes,
  detectProcesses, parseProcessJson, parseStepLines, parseSource, parseGitLog, parseCsv, parseIncidents, detectPersonalData, dropPersonalData,
  resolvePaths, commitRefs, purposeOf, layerOf, commonPrefix, mapProcessAgainstGraph,
} from '../src';

describe('text handling', () => {
  it('decodes Windows-1252 when the bytes are not valid UTF-8, and normalises CRLF', () => {
    const bytes = Uint8Array.from([0x43, 0x61, 0x66, 0xe9, 0x0d, 0x0a, 0x78]); // "Café\r\nx" in 1252
    expect(decodeSource(bytes)).toBe('Café\nx');
    expect(decodeSource(new TextEncoder().encode('\uFEFFhi'))).toBe('hi');
  });
  it('blanks comments and string contents but keeps offsets', () => {
    const src = 'RUN a.p. /* RUN b.p. */ DISPLAY "RUN c.p." // RUN d.p.\nRUN e.p.';
    const out = stripAbl(src);
    expect(out.length).toBe(src.length);
    expect(parseProcedural(src).runs).toEqual(['a.p', 'e.p']);
  });
  it('a header containing "schema/*.df" does not swallow the file', () => {
    const src = '/* see database/schema/*.df for tables */\nCLASS a.B:\nEND CLASS.';
    expect(stripAbl(src)).toContain('CLASS a.B:');
  });
});

describe('class parsing', () => {
  const cls = `/*---------
  Class: Foo
  Purpose: Does foo things.
---------*/
USING x.y.Bar.
USING x.z.*.
CLASS a.b.Foo INHERITS x.y.Base IMPLEMENTS x.y.IOne, x.y.ITwo ABSTRACT:
  DEFINE PRIVATE VARIABLE o AS x.y.Bar NO-UNDO.
  @Test.
  METHOD PUBLIC VOID CheckIt ():
    o = NEW x.y.Bar().
    CAST(o, x.y.Baz).
  END METHOD.
  METHOD PUBLIC VOID Create
    (INPUT a AS CHARACTER):
  END METHOD.
  /* METHOD PUBLIC VOID Commented (): */
END CLASS.`;
  const c = parseClass('a/b/Foo.cls', cls)!;
  it('captures kind, hierarchy and methods', () => {
    expect(c.symbol).toMatchObject({ fqn: 'a.b.Foo', name: 'Foo', classKind: 'abstract', inherits: 'x.y.Base', implements: ['x.y.IOne', 'x.y.ITwo'] });
    expect(c.symbol.methods).toEqual(['CheckIt', 'Create']);
  });
  it('detects @Test methods and ignores commented-out methods', () => {
    expect(c.symbol.tests).toEqual(['CheckIt']);
    expect(c.symbol.methods).not.toContain('Commented');
  });
  it('captures USING, AS, CAST and NEW references', () => {
    expect(c.uses).toEqual(['x.y.Bar', 'x.z.*']);
    expect(c.creates).toEqual(['x.y.Bar']);
    expect(c.typeRefs).toEqual(expect.arrayContaining(['x.y.Bar', 'x.y.Baz']));
    expect(c.typeRefs).not.toContain('CHARACTER');
  });
  it('recognises interfaces and abstract-before-name', () => {
    expect(parseClass('I.cls', 'INTERFACE a.IFoo:\nEND INTERFACE.')!.symbol.classKind).toBe('interface');
    expect(parseClass('A.cls', 'ABSTRACT CLASS a.Foo:\nEND CLASS.')!.symbol.classKind).toBe('abstract');
    expect(parseClass('N.cls', '/* no class here */')).toBeNull();
  });
  it('purposeOf reads Purpose paragraphs', () => {
    expect(purposeOf('Class: Foo\nPurpose: Does things\n  over lines.\n\nOther: x')).toBe('Does things over lines.');
  });
});

describe('procedural + table access', () => {
  it('finds RUN and includes, ignoring preprocessor arguments', () => {
    const r = parseProcedural('RUN src/a/x.p. RUN "y.w". {inc/z.i} {&SCOPED} {1}');
    expect(r.runs).toEqual(['src/a/x.p', 'y.w']);
    expect(r.includes).toEqual(['inc/z.i']);
  });
  it('classifies FOR EACH/FIND as reads and CREATE/DELETE as writes for known tables only', () => {
    const acc = parseTableAccess('FOR EACH Contract. FIND FIRST Person. FIND NEXT Benefit. CREATE Contract. DELETE Person. FIND Unknown. /* FIND Campaign. */', new Set(['contract', 'person', 'benefit', 'campaign']));
    expect(acc).toEqual({ read: ['benefit', 'contract', 'person'], write: ['contract', 'person'] });
  });
});

describe('schema', () => {
  const base = 'ADD TABLE "Benefit"\n  AREA "Schema Area"\nADD FIELD "BenefitId" OF "Benefit" AS character\nADD SEQUENCE "SeqX"\n';
  const delta = 'ADD FIELD "CoverAmount" OF "Benefit" AS decimal\n';
  it('applies baseline before delta/migration regardless of path order', () => {
    const t = mergeSchemas([{ path: 'database/delta/002.df', text: delta }, { path: 'database/schema/base.df', text: base }]);
    const b = t.find((x) => x.name === 'Benefit')!;
    expect(b.fields.map((f) => f.name)).toEqual(['BenefitId', 'CoverAmount']);
    expect(b.fields[1]!.addedIn).toBe('database/delta/002.df');
    expect(b.stub).toBeFalsy();
    expect(t.find((x) => x.type === 'sequence')!.name).toBe('SeqX');
  });
  it('parses field types verbatim', () => {
    expect(parseDf('ADD TABLE "T"\nADD FIELD "f" OF "T" AS int64\n', 'x.df')[0]!.fields[0]!.type).toBe('int64');
  });
});

describe('requirements, rules, processes', () => {
  it('parses requirement ids with dash, en dash, em dash and colon separators; RULE ids are business rules', () => {
    const doc = ['BR-001 — Create Contract', 'body a', 'BR-002 – Link Campaign', '## BR-003 - Capture Details', 'BR-004: Benefits', 'BRULE-001 — Campaign required'].join('\n');
    const r = parseRequirements(doc, 'd.md');
    expect(r.map((x) => [x.code, x.title, x.kind])).toEqual([
      ['BR-001', 'Create Contract', 'requirement'], ['BR-002', 'Link Campaign', 'requirement'], ['BR-003', 'Capture Details', 'requirement'],
      ['BR-004', 'Benefits', 'requirement'], ['BRULE-001', 'Campaign required', 'rule'],
    ]);
    expect(r[0]!.body).toBe('body a');
  });
  it('first definition wins across documents', () => {
    const m = new Map();
    parseRequirements('BR-001 — First', 'a.md', m); parseRequirements('BR-001 — Second', 'b.md', m);
    expect(m.get('BR-001').title).toBe('First');
  });
  it('parses rule-code table rows with the traced requirement', () => {
    const r = parseRuleCodes('| NB-X-001 | `Impl.cls` | BR-001 — Create |\n| Header | a | b |');
    expect(r).toEqual([{ code: 'NB-X-001', impl: 'Impl.cls', trace: 'BR-001 — Create' }]);
  });
  it('detects numbered process runs (with arrow filler) and capitalises step names', () => {
    const doc = 'Claims Process — overview\n\n1. Open claim\n|\nv\n2. VERIFY DETAILS\n|\nv\n3. Pay out\n';
    const p = detectProcesses(doc, 'c.md');
    expect(p).toHaveLength(1);
    expect(p[0]!.name).toBe('Claims Process');
    expect(p[0]!.steps.map((s) => s.name)).toEqual(['Open claim', 'Verify details', 'Pay out']);
  });
  it('ignores short numbered lists without arrows', () => {
    expect(detectProcesses('# T\n1. Alpha one\n2. Beta two\n3. Gamma three', 'x.md')).toEqual([]);
  });
  it('honours process.json overrides with explicit files and rules', () => {
    const p = parseProcessJson(JSON.stringify({ processes: [{ name: 'X', stages: [{ name: 'A', requirement: 'BR-001', files: ['f.cls'], rules: ['R-A-001'] }] }] }), 'process.json')!;
    expect(p[0]!.steps[0]).toMatchObject({ n: 1, requirement: 'BR-001', files: ['f.cls'] });
    expect(parseProcessJson('not json', 'x')).toBeNull();
  });
  it('parses the Add process step lines', () => {
    expect(parseStepLines('Register claim | BR-010\nAssess')).toEqual([{ n: 1, name: 'Register claim', requirement: 'BR-010' }, { n: 2, name: 'Assess', requirement: undefined }]);
  });
});

describe('layers', () => {
  it('derives layers from prefix-stripped paths', () => {
    expect(commonPrefix(['NewBusiness/src/a/B.cls', 'NewBusiness/tests/T.cls', 'NewBusiness/database/x.df'])).toBe('NewBusiness/');
    expect(layerOf('src/domain/entities/C.cls')).toBe('domain');
    expect(layerOf('src/Bootstrap.cls')).toBe('root');
    expect(layerOf('tests/domain/T.cls')).toBe('tests');
    expect(layerOf('README.md', true)).toBe('docs');
  });
});

describe('parseSource on a synthetic repo', () => {
  const files = [
    { path: 'p/database/schema.df', text: 'ADD TABLE "Thing"\nADD FIELD "Id" OF "Thing" AS character\n' },
    { path: 'p/src/domain/entities/Thing.cls', text: '/*----\nPurpose: A thing. BR-001\n----*/\nCLASS domain.entities.Thing:\n  METHOD PUBLIC VOID Save ():\n    CREATE Thing.\n  END METHOD.\nEND CLASS.' },
    { path: 'p/src/services/ThingService.cls', text: 'USING domain.entities.Thing.\nCLASS services.ThingService:\n  DEFINE VARIABLE t AS domain.entities.Thing NO-UNDO.\n  METHOD PUBLIC VOID Go ():\n    t = NEW Thing().\n  END METHOD.\nEND CLASS.' },
    { path: 'p/tests/ThingTest.cls', text: 'USING services.ThingService.\nCLASS tests.ThingTest:\n  @Test.\n  METHOD PUBLIC VOID Works ():\n    DEFINE VARIABLE s AS services.ThingService NO-UNDO.\n  END METHOD.\nEND CLASS.' },
    { path: 'p/README.md', text: 'BR-001 — Make a thing\n' },
  ];
  it('builds edges with origin/confidence and metrics', async () => {
    const g = await parseSource(files, [{ sha: 'a'.repeat(40), author: 'x', date: '2026-01-01', subject: 's', parents: [], files: [{ path: 'p/src/domain/entities/Thing.cls', additions: 1, deletions: 0 }] }]);
    const e = (type: string, from: string, to: string) => g.edges.find((x) => x.type === type && x.from === `file:${from}` && x.to === to);
    expect(e('uses', 'p/src/services/ThingService.cls', 'file:p/src/domain/entities/Thing.cls')).toMatchObject({ origin: 'EXPLICIT', confidence: 1 });
    expect(e('tests', 'p/tests/ThingTest.cls', 'file:p/src/services/ThingService.cls')).toBeTruthy();
    expect(e('mirrors', 'p/src/domain/entities/Thing.cls', 'table:thing')).toMatchObject({ origin: 'INFERRED', confidence: 0.9 });
    expect(e('db-write', 'p/src/domain/entities/Thing.cls', 'table:thing')).toBeTruthy();
    expect(e('implements-req', 'p/src/domain/entities/Thing.cls', 'req:BR-001')).toBeTruthy();
    const m = g.metrics.find((x) => x.path === 'p/src/domain/entities/Thing.cls')!;
    expect(m).toMatchObject({ churn: 1, fanIn: 1 });
  });
  it('ignores bulk commits for churn (> 20 files)', async () => {
    const bulk = { sha: 'b'.repeat(40), author: 'x', date: '2026-01-02', subject: 'bulk', parents: [], files: Array.from({ length: 21 }, (_, i) => ({ path: i === 0 ? 'p/src/domain/entities/Thing.cls' : `p/f${i}.cls`, additions: 1, deletions: 0 })) };
    const g = await parseSource(files, [bulk]);
    expect(g.metrics.find((x) => x.path === 'p/src/domain/entities/Thing.cls')!.churn).toBe(0);
  });
});

describe('history + imports', () => {
  it('parses gitlog blocks, names branches from merge commits and drops merges', () => {
    const log = [
      '@@aaaaaaa|' + 'a'.repeat(40) + '|Ann|2026-01-03T00:00:00Z|' + 'b'.repeat(40) + ' ' + 'c'.repeat(40) + "|Merge branch 'feature/x' into 'main'",
      '@@ccccccc|' + 'c'.repeat(40) + '|Ann|2026-01-02T00:00:00Z|' + 'd'.repeat(40) + '|feat: x NBJ-1',
      '', '3\t1\tsrc/a.cls', '@@bbbbbbb|' + 'b'.repeat(40) + '|Ann|2026-01-01T00:00:00Z||init',
    ].join('\n');
    const c = parseGitLog(log);
    expect(c.map((x) => x.sha[0])).toEqual(['b', 'c']);
    expect(c[1]).toMatchObject({ branch: 'feature/x', files: [{ path: 'src/a.cls', additions: 3, deletions: 1 }] });
  });
  it('extracts ticket references from commit subjects', () => {
    expect(commitRefs('fix TSK192351 and NBJ-127 (UTF-8)')).toEqual(['TSK192351', 'NBJ-127', 'UTF-8']);
  });
  it('parses CSV with quotes and multi-value cells', () => {
    const rows = parseIncidents('id,sev,title,files,reqs\nINC-1,P2,"A, B","a/b.cls;c.p",BR-1;BR-2\n');
    expect(rows[0]).toMatchObject({ key: 'INC-1', title: 'A, B', files: ['a/b.cls', 'c.p'], reqs: ['BR-1', 'BR-2'] });
    expect(parseCsv('a,b\n\n1,2\n').rows).toEqual([{ a: '1', b: '2' }]);
  });
  it('detects personal-data columns by header and by value, and drops them by default', () => {
    const rows = [{ id: 'I1', title: 'x', 'contact email': 'a@b.co', notes: '0821234567', ref: '8001015009087' }, { id: 'I2', title: 'y', 'contact email': 'c@d.co', notes: '0839876543', ref: '9001015009087' }];
    const f = detectPersonalData(['id', 'title', 'contact email', 'notes', 'ref'], rows);
    expect(f.map((x) => x.column).sort()).toEqual(['contact email', 'notes', 'ref']);
    expect(dropPersonalData(rows, f)[0]).toEqual({ id: 'I1', title: 'x' });
    expect(Object.keys(dropPersonalData(rows, f, ['notes'])[0]!)).toContain('notes');
  });
  it('resolves paths by suffix, flags ambiguity, and leaves unknowns unresolved', () => {
    const paths = ['A/src/x/Foo.cls', 'A/src/y/Bar.p', 'B/src/y/Bar.p'];
    const r = resolvePaths(['x/Foo.cls', 'Bar.p', 'Missing.p', 'Foo'], paths);
    expect(r[0]!.resolved).toBe('A/src/x/Foo.cls');
    expect(r[1]!.ambiguous).toEqual(['A/src/y/Bar.p', 'B/src/y/Bar.p']);
    expect(r[2]).toEqual({ input: 'Missing.p' });
    expect(r[3]!.resolved).toBe('A/src/x/Foo.cls');
  });
});

describe('mapping a stored graph (custom processes / re-projection)', () => {
  it('produces exactly the parse-time edges for a detected process', async () => {
    const { loadFixture } = await import('../../../test/helpers/fixture');
    const fx = await loadFixture();
    const p = fx.graph.processes[0]!;
    const remap = mapProcessAgainstGraph(fx.graph, { ...p, steps: p.steps.map((s) => ({ ...s })) });
    const original = fx.graph.edges.filter((e) => e.from.startsWith(`step:${p.name}#`));
    const key = (e: { type: string; from: string; to: string; confidence: number; origin: string }) => `${e.type}|${e.from}|${e.to}|${e.confidence}|${e.origin}`;
    expect(remap.map(key).sort()).toEqual(original.map(key).sort());
  });
  it('maps a new custom process with the same heuristics, honouring an explicit requirement', async () => {
    const { loadFixture } = await import('../../../test/helpers/fixture');
    const fx = await loadFixture();
    const edges = mapProcessAgainstGraph(fx.graph, { name: 'Collections review', origin: 'MANUAL', steps: [{ n: 1, name: 'Review collection instruction', requirement: 'BR-005' }, { n: 2, name: 'Check benefit selection' }] });
    const s1 = edges.filter((e) => e.from === 'step:Collections review#1');
    expect(s1.find((e) => e.type === 'maps-step-req')).toMatchObject({ to: 'req:BR-005', origin: 'EXPLICIT', confidence: 1 });
    expect(s1.some((e) => e.type === 'maps-step-file' && e.to.endsWith('CollectionInstruction.cls'))).toBe(true);
    expect(edges.filter((e) => e.from === 'step:Collections review#2' && e.type === 'maps-step-req')[0]?.origin ?? 'INFERRED').toBe('INFERRED');
  });
});
