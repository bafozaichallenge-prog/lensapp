import type { GraphInput } from '@lens/core';

export interface ValidationIssue { level: 'error' | 'warn'; message: string }

/**
 * Integrity checks run before a snapshot may be activated (plan §9): non-empty, edges point at known
 * entities, and a sudden collapse relative to the previous active snapshot is rejected.
 */
export function validateGraph(g: GraphInput, prev?: { files: number }): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (g.files.length === 0) issues.push({ level: 'error', message: 'Graph has no files' });
  const paths = new Set(g.files.map((f) => `file:${f.path}`));
  const reqs = new Set(g.requirements.map((r) => `req:${r.code}`));
  const rules = new Set(g.ruleCodes.map((r) => `rule:${r.code}`));
  const tables = new Set(g.tables.map((t) => `table:${t.name.toLowerCase()}`));
  const steps = new Set(g.processes.flatMap((p) => p.steps.map((s) => `step:${p.name}#${s.n}`)));
  const known = (r: string) => paths.has(r) || reqs.has(r) || rules.has(r) || tables.has(r) || steps.has(r);
  let dangling = 0;
  for (const e of g.edges) {
    if (!known(e.from) || !known(e.to)) { if (dangling++ < 5) issues.push({ level: 'error', message: `Dangling edge ${e.type} ${e.from} -> ${e.to}` }); }
    if (e.confidence < 0 || e.confidence > 1) issues.push({ level: 'error', message: `Confidence out of range on ${e.type} ${e.from} -> ${e.to}` });
    if (e.origin === 'INFERRED' && e.evidence == null) issues.push({ level: 'warn', message: `Inferred edge without evidence ${e.type} ${e.from} -> ${e.to}` });
  }
  if (dangling > 5) issues.push({ level: 'error', message: `… ${dangling - 5} more dangling edges` });
  if (prev && prev.files >= 10 && g.files.length < prev.files * 0.5) {
    issues.push({ level: 'error', message: `File count fell from ${prev.files} to ${g.files.length} (>50%); refusing to activate` });
  }
  return issues;
}
export const hasErrors = (i: ValidationIssue[]) => i.some((x) => x.level === 'error');
