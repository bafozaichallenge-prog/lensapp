import type { GraphInput } from '@lens/core';

/**
 * Canonical, order-independent fact lines for a graph. Golden tests compare these line-by-line so a parser
 * change reports exactly which facts appeared or vanished instead of a generic mismatch (plan §12).
 */
export function extractFacts(g: GraphInput): string[] {
  const f: string[] = [];
  for (const x of g.files) f.push(`file ${x.path} kind=${x.kind} layer=${x.layer ?? '-'} loc=${x.loc}${x.isTest ? ' test' : ''}`);
  for (const s of g.symbols) f.push(`class ${s.fqn} ${s.classKind} inherits=${s.inherits ?? '-'} implements=${s.implements.join('+') || '-'} methods=${s.methods.join('+')} tests=${s.tests.join('+') || '-'}`);
  for (const e of g.edges) f.push(`edge ${e.type} ${e.from} -> ${e.to} ${e.origin} ${e.confidence}`);
  for (const r of g.requirements) f.push(`req ${r.code} ${r.kind} "${r.title}" doc=${r.docPath}`);
  for (const r of g.ruleCodes) f.push(`rule ${r.code} impl="${r.impl}" trace="${r.trace}"`);
  for (const t of g.tables) f.push(`table ${t.name} ${t.type} added=${t.addedIn} fields=${t.fields.map((x) => `${x.name}:${x.type}@${x.addedIn}`).join(',')}`);
  for (const p of g.processes) {
    f.push(`process ${p.name} ${p.origin} steps=${p.steps.length}`);
    for (const s of p.steps) f.push(`step ${p.name}#${s.n} "${s.name}"`);
  }
  for (const m of g.metrics) f.push(`metric ${m.path} loc=${m.loc} churn=${m.churn} fanIn=${m.fanIn} tests=${m.directTests}`);
  return f.sort();
}

export interface FactDiff { missing: string[]; unexpected: string[] }

export function diffFacts(expected: string[], actual: string[]): FactDiff {
  const e = new Set(expected), a = new Set(actual);
  return { missing: expected.filter((x) => !a.has(x)), unexpected: actual.filter((x) => !e.has(x)) };
}

export const isEmptyDiff = (d: FactDiff) => d.missing.length === 0 && d.unexpected.length === 0;

/** Readable diff, grouped by fact kind, for test failure messages. */
export function formatDiff(d: FactDiff, limit = 40): string {
  const fmt = (label: string, arr: string[], sign: string) => arr.length
    ? `${label} (${arr.length}):\n${arr.slice(0, limit).map((x) => `  ${sign} ${x}`).join('\n')}${arr.length > limit ? `\n  … ${arr.length - limit} more` : ''}`
    : '';
  return [fmt('Facts that disappeared', d.missing, '-'), fmt('Facts that appeared', d.unexpected, '+')].filter(Boolean).join('\n') || 'no differences';
}
