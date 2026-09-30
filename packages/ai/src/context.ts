import type { ImpactResult } from '@lens/impact';
import { purposeOf } from '@lens/ingest';
import type { RepoIndex } from './repo';

export const DEFAULT_CONTEXT_BUDGET = 80_000; // characters; the prototype allowed 150k

/**
 * Bounded orientation context (plan §15.2): architecture notes, processes, requirements, rules, tables,
 * a file index, recent history and the deterministic pre-analysis. Deeper detail comes through tools.
 * Sections are emitted in priority order so truncation drops the least important material first.
 */
export function contextBlock(i: RepoIndex, imp: ImpactResult, budget = DEFAULT_CONTEXT_BUDGET): string {
  const g = i.graph, s = i.strip;
  const L: string[] = [];
  L.push(`SYSTEM SOURCE IN SCOPE: ${i.sourceName} (${i.vertical}). Progress OpenEdge ABL.`);
  const readme = [...i.texts].find(([p]) => /readme\.md$/i.test(p)) ?? [...i.texts].find(([p]) => /architecture\.md$/i.test(p));
  if (readme) L.push('', `ARCHITECTURE NOTES (from ${s(readme[0])}):`, readme[1].slice(0, 2500));
  L.push('', 'PROCESSES:');
  for (const pr of i.view.processes) {
    L.push(`# ${pr.name}`);
    for (const st of pr.steps) L.push(`${st.n}. ${st.name} | ${st.req ?? '-'} | rules ${st.rules.join(', ') || '-'} | tables ${st.tables.join(', ') || '-'} | files ${st.files.map(s).join(', ') || '-'}`);
  }
  L.push('', 'REQUIREMENTS:'); for (const r of g.requirements) L.push(`${r.code} ${r.title}`);
  L.push('', 'RULE CODES:'); for (const r of g.ruleCodes) L.push(`${r.code} | ${r.impl} | ${r.trace}`);
  L.push('', 'TABLES:'); for (const t of g.tables.filter((x) => x.type === 'table')) L.push(`${t.name}: ${t.fields.map((f) => `${f.name} ${f.type}`).join(', ')}`);
  L.push('', 'FILE INDEX (path | kind | ids | purpose):');
  const refs = new Map<string, string[]>();
  for (const e of g.edges) if (e.type === 'implements-req' || e.type === 'enforces') (refs.get(e.from.slice(5)) ?? refs.set(e.from.slice(5), []).get(e.from.slice(5))!).push(e.to.replace(/^[a-z]+:/, ''));
  for (const f of g.files) if (['class', 'procedure', 'include', 'schema'].includes(f.kind)) L.push(`${s(f.path)} | ${i.view.files.get(f.path)?.kind ?? f.kind} | ${(refs.get(f.path) ?? []).join(' ') || '-'} | ${purposeOf(f.header).slice(0, 120)}`);
  L.push('', 'COMMITS (latest 60):'); for (const c of i.commits.slice(-60)) L.push(`${c.sha.slice(0, 7)} ${c.date.slice(0, 10)} ${c.branch ?? '-'} ${c.subject}`);
  L.push('', 'TICKETS:'); for (const t of i.tickets.slice(-80)) L.push(`${t.key} / ${t.taskmanager || '-'} / ${t.title} / commit ${t.commit?.slice(0, 7) ?? '-'} / ${t.note}`);
  L.push('', 'INCIDENTS:'); for (const n of i.incidents.slice(-80)) L.push(`${n.key} ${n.severity} ${n.status}: ${n.title}. Root: ${n.rootCause} Files: ${n.files.map(s).join(', ')}. Fix: ${n.fixTicket ?? 'none'}. ${n.residual}`);
  L.push('', 'CODE-GRAPH PRE-ANALYSIS (deterministic, may include false positives):',
    `matched files: ${imp.seeds.map(s).join(', ') || 'none'}`, `dependents: ${imp.ripple.map(s).join(', ') || 'none'}`, `existing tests: ${imp.tests.map(s).join(', ') || 'none'}`,
    `process steps: ${imp.processes.map((x) => `${x.name} ${x.steps.join('/')}`).join('; ') || 'none'}; incidents: ${imp.incidents.join(', ') || 'none'}; tickets: ${imp.tickets.join(', ') || 'none'}`);
  const text = L.join('\n');
  return text.length <= budget ? text : text.slice(0, budget) + '\n…(context truncated; use the tools for more)';
}
