import type { GraphInput, CommitInput } from '@lens/core';

export interface ViewFile {
  path: string; name: string; kind: 'class' | 'abstract class' | 'interface' | 'procedure' | 'include' | 'test'; layer: string;
  methods: string[]; header?: string; fanIn: number; testedBy: string[]; codeRefs: string[];
}
export interface ViewStep { n: number; name: string; req: string | null; files: string[]; rules: string[]; tables: string[] }
export interface ViewProcess { name: string; steps: ViewStep[] }
export interface ViewIncident { key: string; files: string[]; reqs: string[] }
export interface ViewTicket { key: string; commit: string | null }
export interface GraphView {
  files: Map<string, ViewFile>;
  incoming: Map<string, { from: string; type: string }[]>;
  processes: ViewProcess[];
  incidents: ViewIncident[];
  tickets: ViewTicket[];
  commits: Pick<CommitInput, 'sha' | 'files'>[];
}
export const STRUCT = new Set(['uses', 'creates', 'inherits', 'implements', 'runs', 'includes']);
export const CODE_KINDS = new Set(['class', 'abstract class', 'interface', 'procedure', 'include', 'test']);

/** Adapt a GraphInput (+ imported history) into the shape the prototype's impact heuristics were written against. */
export function buildView(g: GraphInput, extra: { incidents?: ViewIncident[]; tickets?: ViewTicket[]; commits?: CommitInput[] } = {}): GraphView {
  const symByFile = new Map(g.symbols.map((s) => [s.file, s]));
  const incoming = new Map<string, { from: string; type: string }[]>();
  for (const e of g.edges) {
    if (!e.to.startsWith('file:')) continue;
    const k = e.to.slice(5);
    (incoming.get(k) ?? incoming.set(k, []).get(k)!).push({ from: e.from.slice(5), type: e.type });
  }
  // index outgoing edges once: scanning the whole edge list per file/step is quadratic on large repositories
  const outgoing = new Map<string, GraphInput['edges']>();
  for (const e of g.edges) (outgoing.get(e.from) ?? outgoing.set(e.from, []).get(e.from)!).push(e);
  const files = new Map<string, ViewFile>();
  for (const f of g.files) {
    if (!['class', 'procedure', 'include'].includes(f.kind)) continue;
    const sym = symByFile.get(f.path);
    const kind: ViewFile['kind'] = f.isTest ? 'test' : sym ? (sym.classKind === 'interface' ? 'interface' : sym.classKind === 'abstract' ? 'abstract class' : 'class') : f.kind === 'include' ? 'include' : 'procedure';
    const inc = incoming.get(f.path) ?? [];
    files.set(f.path, {
      path: f.path, name: sym?.name ?? f.path.slice(f.path.lastIndexOf('/') + 1), kind, layer: f.layer ?? 'root', methods: sym?.methods ?? [], header: f.header,
      fanIn: inc.filter((x) => STRUCT.has(x.type)).length,
      testedBy: [...new Set(inc.filter((x) => x.type === 'tests').map((x) => x.from))].sort(),
      codeRefs: (outgoing.get(`file:${f.path}`) ?? []).filter((e) => e.type === 'enforces').map((e) => e.to.slice(5)),
    });
  }
  const processes: ViewProcess[] = g.processes.map((p) => ({
    name: p.name,
    steps: p.steps.map((s) => {
      const ref = `step:${p.name}#${s.n}`;
      const es = outgoing.get(ref) ?? [];
      const of = (t: string) => es.filter((e) => e.type === t).sort((a, b) => (a.evidence?.rank ?? 0) - (b.evidence?.rank ?? 0)).map((e) => e.to.replace(/^[a-z]+:/, ''));
      return { n: s.n, name: s.name, req: of('maps-step-req')[0] ?? null, files: of('maps-step-file'), rules: of('maps-step-rule'), tables: of('maps-step-table') };
    }),
  }));
  return { files, incoming, processes, incidents: extra.incidents ?? [], tickets: extra.tickets ?? [], commits: extra.commits ?? [] };
}
