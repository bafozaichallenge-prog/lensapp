import type {
  Edge, FileNode, GraphInput, ParseOptions, ProcessNode, RequirementNode, RuleCodeNode, SourceFile, SymbolNode, CommitInput, TableNode, FileKind,
} from '@lens/core';
import { fileRef, symRef, reqRef, ruleRef, tableRef } from '@lens/core';
import { baseName, camelWords, commonPrefix, countLoc, ext, layerOf } from './text';
import { parseClass, extractHeader, extractTypeRefs, type ParsedClass } from './cls';
import { parseProcedural, parseTableAccess } from './procedural';
import { mergeSchemas } from './df';
import { parseRequirements, parseRuleCodes } from './docs';
import { detectProcesses, parseProcessJson } from './process';
import { mapProcessSteps, type StepFile } from './stepmap';

const CODE_EXT = new Set(['.cls', '.p', '.w', '.i', '.t']);
const DOC_EXT = new Set(['.md', '.markdown', '.txt']);
const SKIP = /(^|\/)(\.git|node_modules|build|dist)\//;
const STRUCT = new Set(['uses', 'creates', 'inherits', 'implements', 'runs', 'includes']);

const kindOf = (p: string): FileKind => {
  switch (ext(p)) {
    case '.cls': return 'class';
    case '.p': case '.w': case '.t': return 'procedure';
    case '.i': return 'include';
    case '.df': return 'schema';
    case '.md': case '.markdown': case '.txt': return 'doc';
    case '.json': case '.xml': case '.yml': return 'data';
    default: return 'other';
  }
};

/**
 * Stable interface (plan §5): parseSource(files, history, options) -> GraphInput.
 * Pure and deterministic: the same inputs always yield the same graph (idempotency, plan §12).
 * Heuristics are ported from the prototype ingest(); origin/confidence metadata is added.
 */
export async function parseSource(files: SourceFile[], history: CommitInput[] = [], options: ParseOptions = {}): Promise<GraphInput> {
  const warnings: string[] = [];
  const sorted = [...files].filter((f) => !SKIP.test(f.path)).sort((a, b) => a.path.localeCompare(b.path));

  // prefix-stripped paths drive layers only; graph paths stay repo-relative so they resolve against the source
  const relevant = sorted.filter((f) => /\.(cls|p|i|w|df|md|txt)$/i.test(f.path)).map((f) => f.path);
  const pre = commonPrefix(relevant);
  const rel = (p: string) => (pre && p.startsWith(pre) ? p.slice(pre.length) : p);

  // ---- schema
  const tables: TableNode[] = mergeSchemas(sorted.filter((f) => ext(f.path) === '.df'));
  const tableByLower = new Map(tables.filter((t) => t.type === 'table').map((t) => [t.name.toLowerCase(), t.name]));
  const tableSet = new Set(tableByLower.keys());

  // ---- docs: requirements, rule codes, processes
  const reqMap = new Map<string, RequirementNode>();
  const ruleMap = new Map<string, RuleCodeNode>();
  const detected: ProcessNode[] = [];
  let explicit: ProcessNode[] | null = null;
  for (const f of sorted) {
    if (baseName(f.path).toLowerCase() === 'process.json' || (ext(f.path) === '.json' && f.text.includes('"processes"'))) {
      const p = parseProcessJson(f.text, f.path);
      if (p) explicit = [...(explicit ?? []), ...p];
      continue;
    }
    if (!DOC_EXT.has(ext(f.path))) continue;
    const d = rel(f.path);
    parseRequirements(f.text, d, reqMap);
    parseRuleCodes(f.text, ruleMap);
    detected.push(...detectProcesses(f.text, d));
  }
  const requirements = [...reqMap.values()];
  const ruleCodes = [...ruleMap.values()];
  const processes = explicit ?? detected; // process.json replaces detection (prototype behaviour)

  // ---- code files & classes
  const fileNodes: FileNode[] = [];
  const symbols: SymbolNode[] = [];
  const parsed = new Map<string, ParsedClass>();
  const stepFiles: StepFile[] = [];
  for (const f of sorted) {
    const k = kindOf(f.path);
    const isDoc = k === 'doc';
    const layer = layerOf(rel(f.path), isDoc);
    const isCode = CODE_EXT.has(ext(f.path));
    let header = isCode ? extractHeader(f.text) : undefined;
    let fileKind: StepFile['kind'] = k === 'include' ? 'include' : 'procedure';
    let isTest = false;
    let name = baseName(f.path);
    if (ext(f.path) === '.cls') {
      const c = parseClass(f.path, f.text);
      if (c) {
        parsed.set(f.path, c);
        name = c.symbol.name;
        fileKind = c.symbol.classKind === 'interface' ? 'interface' : c.symbol.classKind === 'abstract' ? 'abstract class' : 'class';
        if (layer === 'tests') { fileKind = 'test'; c.symbol.classKind = 'test'; }
        else if (c.symbol.classKind === 'test') fileKind = 'test';
        isTest = fileKind === 'test';
        symbols.push(c.symbol);
      } else warnings.push(`No class declaration found in ${f.path}`);
    }
    fileNodes.push({ path: f.path, kind: k, layer, loc: countLoc(f.text), header, isTest });
    if (isCode) stepFiles.push({ path: f.path, name, kind: fileKind, layer, reqRefs: [] });
  }
  const stepFileByPath = new Map(stepFiles.map((s) => [s.path, s]));

  // ---- symbol / file resolution
  const symByName = new Map<string, string>(); // fqn and simple name -> file (prototype classTo)
  for (const s of symbols) { symByName.set(s.fqn, s.file); symByName.set(s.name, s.file); }
  const fqnBySimple = new Map(symbols.map((s) => [s.file, s.fqn]));
  const resolveType = (n: string) => symByName.get(n) ?? symByName.get(n.slice(n.lastIndexOf('.') + 1));
  const paths = fileNodes.map((f) => f.path);
  const resolveRun = (r: string, from: string): string[] => {
    const short = r.replace(/^src\//, '');
    const hits = paths.filter((k) => k !== from && (k.endsWith(short) || r.endsWith(k)));
    return hits;
  };

  // ---- edges
  const edges: Edge[] = [];
  const add = (from: string, to: string, type: Edge['type'], origin: Edge['origin'], confidence: number, reason: string, refs?: string[]) => {
    if (from === to) return;
    edges.push({ from, to, type, origin, confidence, evidence: { reason, refs } });
  };
  const reqIds = new Set(requirements.map((r) => r.code));
  const ruleIds = new Set(ruleCodes.map((r) => r.code));
  const fileTables = new Map<string, string[]>();
  const fanIn = new Map<string, number>();
  const tested = new Map<string, Set<string>>();

  for (const f of sorted) {
    if (!CODE_EXT.has(ext(f.path))) continue;
    const from = fileRef(f.path);
    const sf = stepFileByPath.get(f.path)!;
    // requirement / rule codes (comments included, as in the prototype)
    const reqRefs = [...new Set([...f.text.matchAll(/\b[A-Z]{2,6}-\d{2,4}\b/g)].map((m) => m[0]))].filter((x) => reqIds.has(x)).sort();
    const codeRefs = [...new Set([...f.text.matchAll(/\b[A-Z]{2,5}-[A-Z]+-\d{3}\b/g)].map((m) => m[0]))].filter((x) => ruleIds.has(x)).sort();
    sf.reqRefs = reqRefs;
    for (const c of reqRefs) add(from, reqRef(c), 'implements-req', 'EXPLICIT', 1, 'requirement id referenced in source');
    for (const c of codeRefs) add(from, ruleRef(c), 'enforces', 'EXPLICIT', 1, 'rule code referenced in source');

    const acc = parseTableAccess(f.text, tableSet);
    for (const t of acc.read) add(from, tableRef(t), 'db-read', 'EXPLICIT', 1, 'FOR EACH / FIND');
    for (const t of acc.write) add(from, tableRef(t), 'db-write', 'EXPLICIT', 1, 'CREATE / DELETE');
    if (acc.read.length || acc.write.length) fileTables.set(f.path, [...new Set([...acc.read, ...acc.write])].sort());

    // RUN x.p and {x.i} occur in classes too (prototype scans every code file)
    const pr = parseProcedural(f.text);
    for (const r of pr.runs) for (const t of resolveRun(r, f.path)) add(from, fileRef(t), 'runs', 'EXPLICIT', 1, `RUN ${r}`);
    for (const r of pr.includes) for (const t of resolveRun(r, f.path)) add(from, fileRef(t), 'includes', 'EXPLICIT', 1, `{${r}}`);

    const c = parsed.get(f.path);
    const self = c?.symbol;
    const refs = c ?? extractTypeRefs(f.text);
    const isTestFile = sf.kind === 'test';
    if (self?.inherits) { const t = resolveType(self.inherits); if (t) add(from, fileRef(t), 'inherits', 'EXPLICIT', 1, `INHERITS ${self.inherits}`, [symRef(self.inherits)]); }
    for (const i of self?.implements ?? []) { const t = resolveType(i); if (t) add(from, fileRef(t), 'implements', 'EXPLICIT', 1, `IMPLEMENTS ${i}`, [symRef(i)]); }
    const seen = new Set<string>();
    const lists: [string[], Edge['type']][] = [[refs.uses.filter((u) => !u.endsWith('*')), 'uses'], [refs.typeRefs.filter((t) => !refs.creates.includes(t)), 'uses'], [refs.creates, 'creates']];
    for (const [list, type] of lists) for (const u of list) {
      const t = resolveType(u);
      if (!t || t === f.path || seen.has(t)) continue;
      seen.add(t);
      // In the tests layer every dependency is a "tests" edge (prototype behaviour, including test-support classes).
      if (isTestFile) add(from, fileRef(t), 'tests', 'EXPLICIT', 1, `test references ${u}`, [symRef(fqnBySimple.get(t) ?? u)]);
      else add(from, fileRef(t), type, 'EXPLICIT', 1, type === 'creates' ? `NEW ${u}(` : `USING/AS/CAST ${u}`, [symRef(fqnBySimple.get(t) ?? u)]);
    }
    // mirrors: entity classes named like a table
    if (self && (sf.layer === 'entities' || /domain\/entities\//.test(f.path)) && tableByLower.has(self.name.toLowerCase())) {
      add(from, tableRef(self.name), 'mirrors', 'INFERRED', 0.9, 'entity class name equals table name');
    }
  }
  const uniq = new Map<string, Edge>();
  for (const e of edges) { const k = `${e.type}|${e.from}|${e.to}`; if (!uniq.has(k)) uniq.set(k, e); }
  const baseEdges = [...uniq.values()];
  for (const e of baseEdges) {
    if (!e.to.startsWith('file:')) continue;
    const p = e.to.slice(5);
    if (STRUCT.has(e.type)) fanIn.set(p, (fanIn.get(p) ?? 0) + 1);
    if (e.type === 'tests') { const s = tested.get(p) ?? new Set(); s.add(e.from.slice(5)); tested.set(p, s); }
  }

  // tables a file touches include entity mirrors (prototype: any edge from the file to table:*)
  for (const e of baseEdges) {
    if (e.type !== 'mirrors') continue;
    const p = e.from.slice(5), t = e.to.slice(6);
    fileTables.set(p, [...new Set([...(fileTables.get(p) ?? []), t])].sort());
  }

  // ---- metrics
  const maxFiles = options.churnMaxFiles ?? 20;
  const churn = new Map<string, number>();
  for (const c of history) {
    if (c.files.length > maxFiles) continue; // bulk commits are ignored
    for (const cf of c.files) churn.set(cf.path, (churn.get(cf.path) ?? 0) + 1);
  }
  const metrics = fileNodes.map((f) => ({
    path: f.path, loc: f.loc, churn: churn.get(f.path) ?? 0, incidents: 0, fanIn: fanIn.get(f.path) ?? 0, directTests: tested.get(f.path)?.size ?? 0,
  }));

  // ---- process step mapping
  const stepEdges: Edge[] = [];
  for (const p of processes) {
    stepEdges.push(...mapProcessSteps(p, { files: stepFiles, requirements, ruleCodes, fanIn, fileTables, maxStepFiles: options.maxStepFiles ?? 8 }));
  }

  const ord = (a: Edge, b: Edge) => a.type.localeCompare(b.type) || a.from.localeCompare(b.from) || a.to.localeCompare(b.to);
  void camelWords;
  return {
    files: fileNodes,
    symbols: symbols.sort((a, b) => a.fqn.localeCompare(b.fqn)),
    edges: [...baseEdges, ...stepEdges].sort(ord),
    tables,
    requirements: requirements.sort((a, b) => a.code.localeCompare(b.code)),
    ruleCodes, // document order (inputs are path-sorted, so this is deterministic)
    processes: processes.sort((a, b) => a.name.localeCompare(b.name)),
    metrics,
    warnings,
  };
}
