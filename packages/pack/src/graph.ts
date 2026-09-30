import type { CommitInput, GraphInput } from '@lens/core';
import { camelWords, commonPrefix } from '@lens/ingest';
import type { GraphView } from '@lens/impact';

/** The graph shape the prototype's pack code was written against (paths are prefix-stripped, like the prototype). */
export interface PFile { path: string; name: string; kind: string; layer: string; text: string; tested_by: string[] }
export interface PStage { n: number; name: string; req: string | null; files: string[]; rules: string[]; tables: string[] }
export interface PGraph {
  meta: { head: string | null; head_date: string | null };
  files: Record<string, PFile>;
  tables: Record<string, { name: string; fields: { name: string; type: string }[] }>;
  requirements: Record<string, { id: string; title: string; body: string; kind: 'requirement' | 'brule' }>;
  rulecodes: Record<string, { id: string; impl: string; title: string }>;
  processes: { name: string; stages: PStage[] }[];
  commits: { id: string; date: string; subject: string; files: { path: string }[]; bulk: boolean }[];
  tickets: { id: string; commit: string | null }[];
  incidents: { id: string; title: string; status: string; sev: string; root: string; files: string[]; reqs: string[] }[];
  raw: { path: string }[];
}

export interface PackInput {
  graph: GraphInput;
  view: GraphView;
  files: { path: string; text: string }[];
  commits: CommitInput[];
  tickets: { key: string; commit: string | null }[];
  incidents: { key: string; title: string; status: string; severity: string; rootCause: string; files: string[]; reqs: string[] }[];
}

export function toPackGraph(i: PackInput): PGraph {
  const prefix = commonPrefix(i.files.map((f) => f.path));
  const s = (p: string) => (prefix && p.startsWith(prefix) ? p.slice(prefix.length) : p);
  const text = new Map(i.files.map((f) => [f.path, f.text]));
  const files: Record<string, PFile> = {};
  for (const f of i.graph.files) {
    const v = i.view.files.get(f.path);
    const kind = v?.kind ?? (f.kind === 'schema' ? 'schema' : f.kind === 'doc' ? 'document' : 'file');
    files[s(f.path)] = { path: s(f.path), name: v?.name ?? f.path.slice(f.path.lastIndexOf('/') + 1), kind, layer: v?.layer ?? f.layer ?? 'root', text: text.get(f.path) ?? '', tested_by: (v?.testedBy ?? []).map(s) };
  }
  const tables: PGraph['tables'] = {};
  for (const t of i.graph.tables) if (t.type === 'table') tables[t.name] = { name: t.name, fields: t.fields.map((x) => ({ name: x.name, type: x.type })) };
  const requirements: PGraph['requirements'] = {};
  for (const r of i.graph.requirements) requirements[r.code] = { id: r.code, title: r.title, body: r.body, kind: r.kind === 'rule' ? 'brule' : 'requirement' };
  const rulecodes: PGraph['rulecodes'] = {};
  for (const r of i.graph.ruleCodes) rulecodes[r.code] = { id: r.code, impl: r.impl, title: r.trace };
  const tableName = new Map(i.graph.tables.map((t) => [t.name.toLowerCase(), t.name]));
  const processes = i.view.processes.map((p) => ({
    name: p.name,
    stages: p.steps.map((st) => ({ n: st.n, name: st.name, req: st.req, files: st.files.map(s), rules: st.rules, tables: st.tables.map((t) => tableName.get(t.toLowerCase()) ?? t) })),
  }));
  const commits = i.commits.map((c) => ({ id: c.sha.slice(0, 7), date: c.date, subject: c.subject, files: c.files.map((f) => ({ path: s(f.path) })), bulk: c.files.length > 20 }));
  const tickets = i.tickets.map((t) => ({ id: t.key, commit: t.commit ? t.commit.slice(0, 7) : null }));
  const incidents = i.incidents.map((n) => ({ id: n.key, title: n.title, status: n.status, sev: n.severity, root: n.rootCause, files: n.files.map(s), reqs: n.reqs }));
  const last = i.commits[i.commits.length - 1];
  return { meta: { head: last ? last.sha.slice(0, 7) : null, head_date: last?.date ?? null }, files, tables, requirements, rulecodes, processes, commits, tickets, incidents, raw: [] };
}

export const norm = (t: unknown) => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const titleCase = (n: string) => { const w = camelWords(n).join(' '); return w.charAt(0).toUpperCase() + w.slice(1); };
export { camelWords };

export function prettyBody(t: string): string {
  const out: string[] = []; let buf: string[] = [];
  const flush = () => { if (buf.length) { out.push(buf.join(', ') + '.'); buf = []; } };
  for (const raw of String(t || '').split('\n')) {
    const l = raw.trim();
    if (!l || /^[|v+X-]+$/.test(l) || /^#+/.test(l)) continue;
    if (l.length <= 32 && !/[.:]$/.test(l)) buf.push(l); else { flush(); out.push(l); }
  }
  flush();
  return out.join(' ');
}

export const CODE_KINDS = new Set(['class', 'abstract class', 'interface', 'procedure', 'include', 'test']);
export const incidentsForStage = (g: PGraph, st: PStage) => g.incidents.filter((i) => i.files.some((p) => st.files.includes(p)) || (st.req && i.reqs.includes(st.req)));
export const ticketOf = (g: PGraph, cid: string) => g.tickets.find((t) => t.commit === cid);
