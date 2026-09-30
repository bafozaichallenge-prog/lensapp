import type { Edge, ProcessNode, RequirementNode, RuleCodeNode } from '@lens/core';
import { fileRef, reqRef, ruleRef, tableRef, ref } from '@lens/core';
import { camelWords } from './text';

/** Words ignored when matching step names to requirements/files (prototype STOPW). */
export const STEP_STOPW = new Set('the and for with from into over new details detail capture link'.split(' '));
export const stepWords = (t: string): Set<string> =>
  new Set(camelWords(t).map((w) => w.replace(/s$/, '')).filter((w) => w.length > 2 && !STEP_STOPW.has(w)));

export const stepRef = (proc: string, n: number) => ref('step', `${proc}#${n}`);

export interface StepFile {
  path: string;
  /** Simple class name for classes, base file name otherwise. */
  name: string;
  kind: 'class' | 'abstract class' | 'interface' | 'procedure' | 'include' | 'test';
  layer: string;
  /** Requirement/business-rule ids the file mentions (known ids only). */
  reqRefs: string[];
}

export interface StepMapContext {
  files: StepFile[];
  requirements: RequirementNode[];
  ruleCodes: RuleCodeNode[];
  /** file path -> structural fan-in */
  fanIn: Map<string, number>;
  /** file path -> tables it reads/writes */
  fileTables: Map<string, string[]>;
  maxStepFiles: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Deterministic step -> requirement/code/rule/table mapping, ported from the prototype ingest() and
 * mapStagesIn(). Each relationship gets an origin and a confidence (prototype had neither):
 *  - explicit requirement/files/rules            EXPLICIT 1
 *  - index-aligned requirement                   INFERRED 0.9
 *  - word-overlap requirement                    INFERRED = overlap ratio (>= 0.34)
 *  - file match                                  INFERRED 0.4 + 0.1*score, capped at 0.95
 *  - rule via requirement trace                  INFERRED 0.9
 *  - table via mapped files                      INFERRED 0.7
 */
export function mapProcessSteps(p: ProcessNode, ctx: StepMapContext): Edge[] {
  const edges: Edge[] = [];
  const reqs = ctx.requirements.filter((r) => r.kind === 'requirement').sort((a, b) => a.order - b.order);
  const byCode = new Map(ctx.requirements.map((r) => [r.code, r]));
  const sameDoc = reqs.filter((r) => r.docPath === p.docPath);
  const pool = sameDoc.length === p.steps.length ? sameDoc : reqs.length === p.steps.length ? reqs : null;
  const codeFiles = ctx.files.filter((f) => f.layer !== 'tests' && f.kind !== 'test');

  for (const step of p.steps) {
    const from = stepRef(p.name, step.n);
    let req: string | null = step.requirement && byCode.has(step.requirement) ? step.requirement : null;
    let reqOrigin: 'EXPLICIT' | 'INFERRED' = 'EXPLICIT', reqConf = 1, reqWhy = 'requirement stated on the step';
    if (!req) {
      if (pool) { req = pool[step.n - 1]!.code; reqOrigin = 'INFERRED'; reqConf = 0.9; reqWhy = `step count equals requirement count; index alignment (#${step.n})`; }
      else {
        const sw = stepWords(step.name);
        let best: RequirementNode | null = null, bs = 0;
        for (const r of reqs) { const rw = stepWords(r.title); const ov = [...sw].filter((w) => rw.has(w)).length / Math.max(1, sw.size); if (ov > bs) { bs = ov; best = r; } }
        if (best && bs >= 0.34) { req = best.code; reqOrigin = 'INFERRED'; reqConf = r2(Math.min(bs, 0.95)); reqWhy = `word overlap with "${best.title}"`; }
      }
    }
    if (req) edges.push({ from, to: reqRef(req), type: 'maps-step-req', origin: reqOrigin, confidence: reqConf, evidence: { reason: reqWhy } });

    // ---- files
    let stepFiles: { path: string; origin: 'EXPLICIT' | 'INFERRED'; conf: number; why: string }[];
    if (step.files?.length) {
      stepFiles = step.files.filter((f) => ctx.files.some((x) => x.path === f)).map((path) => ({ path, origin: 'EXPLICIT', conf: 1, why: 'stated in process definition' }));
    } else {
      const sw = stepWords(step.name);
      const ranked = codeFiles.map((f) => {
        const brRefs = f.reqRefs.filter((x) => byCode.get(x)?.kind === 'requirement');
        let sc = 0; const why: string[] = [];
        if (req && f.reqRefs.includes(req)) { const w = brRefs.length <= 2 ? 3 : 1; sc += w; why.push(`references ${req} (+${w})`); }
        const ov = camelWords(f.name).filter((w) => sw.has(w.replace(/s$/, ''))).length;
        if (ov && f.kind !== 'interface') { const w = ov * (sc ? 2 : 1); sc += w; why.push(`class-name overlap ×${ov} (+${w})`); }
        return { f, sc, why };
      }).filter((x) => x.sc >= 1)
        .sort((a, b) => b.sc - a.sc || ((a.f.kind === 'class' ? 0 : 100) - (ctx.fanIn.get(a.f.path) ?? 0)) - ((b.f.kind === 'class' ? 0 : 100) - (ctx.fanIn.get(b.f.path) ?? 0)) || a.f.path.localeCompare(b.f.path));
      const strong = ranked.filter((x) => x.sc >= 2);
      const kept = (strong.length >= 3 ? strong : ranked.slice(0, Math.max(strong.length, 4))).slice(0, ctx.maxStepFiles);
      stepFiles = kept.map((k) => ({ path: k.f.path, origin: 'INFERRED', conf: r2(Math.min(0.95, 0.4 + 0.1 * k.sc)), why: k.why.join(' + ') }));
    }
    stepFiles.forEach((k, rank) => edges.push({ from, to: fileRef(k.path), type: 'maps-step-file', origin: k.origin, confidence: k.conf, evidence: { reason: k.why, refs: [fileRef(k.path)], rank } }));

    // ---- rules: explicit, else rule codes whose trace column mentions the step's requirement
    if (step.rules?.length) {
      step.rules.forEach((c, rank) => edges.push({ from, to: ruleRef(c), type: 'maps-step-rule', origin: 'EXPLICIT', confidence: 1, evidence: { reason: 'stated in process definition', rank } }));
    } else if (req) {
      let rr = 0;
      for (const rc of ctx.ruleCodes) if (rc.trace.includes(req)) edges.push({ from, to: ruleRef(rc.code), type: 'maps-step-rule', origin: 'INFERRED', confidence: 0.9, evidence: { reason: `rule trace mentions ${req}`, rank: rr++ } });
    }

    // ---- tables accessed by the mapped files
    const tables = new Set<string>();
    for (const k of stepFiles) for (const t of ctx.fileTables.get(k.path) ?? []) tables.add(t);
    [...tables].forEach((t, rank) => edges.push({ from, to: tableRef(t), type: 'maps-step-table', origin: 'INFERRED', confidence: 0.7, evidence: { reason: 'table accessed by a mapped file', rank } }));
  }
  return edges;
}

const STRUCT_TYPES = new Set(['uses', 'creates', 'inherits', 'implements', 'runs', 'includes']);

/**
 * Rebuild the step-mapping context from a stored graph, so a custom process added in the UI (or re-projected after a
 * re-sync) is mapped with exactly the same heuristics as processes found during ingestion.
 */
export function stepContextFromGraph(g: import('@lens/core').GraphInput, maxStepFiles = 8): StepMapContext {
  const symByFile = new Map(g.symbols.map((s) => [s.file, s]));
  const reqRefs = new Map<string, string[]>();
  const fanIn = new Map<string, number>();
  const fileTables = new Map<string, string[]>();
  for (const e of g.edges) {
    if (e.type === 'implements-req') (reqRefs.get(e.from.slice(5)) ?? reqRefs.set(e.from.slice(5), []).get(e.from.slice(5))!).push(e.to.slice(4));
    if (STRUCT_TYPES.has(e.type) && e.to.startsWith('file:')) fanIn.set(e.to.slice(5), (fanIn.get(e.to.slice(5)) ?? 0) + 1);
    if (['db-read', 'db-write', 'mirrors'].includes(e.type)) {
      const p = e.from.slice(5), t = e.to.slice(6);
      fileTables.set(p, [...new Set([...(fileTables.get(p) ?? []), t])].sort());
    }
  }
  const tableName = new Map(g.tables.map((t) => [t.name.toLowerCase(), t.name]));
  void tableName;
  const files: StepFile[] = g.files.filter((f) => ['class', 'procedure', 'include'].includes(f.kind)).map((f) => {
    const sym = symByFile.get(f.path);
    const kind: StepFile['kind'] = f.isTest ? 'test' : sym ? (sym.classKind === 'interface' ? 'interface' : sym.classKind === 'abstract' ? 'abstract class' : 'class') : f.kind === 'include' ? 'include' : 'procedure';
    return { path: f.path, name: sym?.name ?? f.path.slice(f.path.lastIndexOf('/') + 1), kind, layer: f.layer ?? 'root', reqRefs: (reqRefs.get(f.path) ?? []).sort() };
  });
  return { files, requirements: g.requirements, ruleCodes: g.ruleCodes, fanIn, fileTables, maxStepFiles };
}

/** Map one process definition (custom or explicit) against a stored graph. */
export function mapProcessAgainstGraph(g: import('@lens/core').GraphInput, p: ProcessNode): Edge[] {
  return mapProcessSteps(p, stepContextFromGraph(g));
}
