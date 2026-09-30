import type { Analysis } from './schema';
import type { RepoIndex } from './repo';

export interface GroundingIssue { level: 'error' | 'warn'; kind: string; where: string; message: string }

/** ABL / OpenEdge.Core.Assert / collection members that tests may legitimately call without them being repo methods. */
const BUILTIN_METHODS = new Set(['Equals', 'IsTrue', 'IsFalse', 'IsNull', 'NotNull', 'IsNotNull', 'AreEqual', 'AreNotEqual', 'ToString', 'Get', 'Put', 'Set', 'Add', 'Remove', 'Clear', 'Size', 'Contains', 'ContainsKey', 'Count', 'Assert', 'Fail', 'Dispose', 'GetClass', 'Length', 'GetHashCode', 'Extent', 'Append', 'Serialize', 'Parse', 'Read', 'Write', 'Instance', 'Success', 'Failure', 'Error', 'Message', 'HasError', 'IsValid', 'IsEmpty', 'NotEmpty', 'IsZero', 'GreaterThan', 'LessThan', 'NotEqual', 'Raises', 'RaiseError', 'Result', 'ToDate', 'Format']);

/** Deterministic entity index for evidence resolution. */
export function entityIndex(i: RepoIndex) {
  const g = i.graph;
  const files = new Set(g.files.map((f) => f.path));
  const stripped = new Set([...files].map(i.strip));
  const codes = new Set([...g.requirements.map((r) => r.code), ...g.ruleCodes.map((r) => r.code)]);
  const tables = new Set(g.tables.map((t) => t.name.toLowerCase()));
  const tickets = new Set(i.tickets.flatMap((t) => [t.key, t.taskmanager].filter(Boolean)));
  const incidents = new Set(i.incidents.map((n) => n.key));
  const commits = i.commits.map((c) => c.sha);
  const symbols = new Set(g.symbols.flatMap((s) => [s.fqn, s.name]));
  const methods = new Set(g.symbols.flatMap((s) => s.methods));
  const processes = new Set(g.processes.map((p) => p.name.toLowerCase()));
  return { files, stripped, codes, tables, tickets, incidents, commits, symbols, methods, processes };
}

/** Does one evidence string point at a real entity in the pinned snapshot? */
export function resolveEvidence(ev: string, i: RepoIndex, idx = entityIndex(i)): boolean {
  const e = String(ev).trim().replace(/^(file|req|rule|table|ticket|incident|commit|sym):/i, '').replace(/[.,;]$/, '');
  if (!e) return false;
  if (idx.stripped.has(e) || idx.files.has(e)) return true;
  if (idx.codes.has(e) || idx.tickets.has(e) || idx.incidents.has(e) || idx.symbols.has(e)) return true;
  if (idx.tables.has(e.toLowerCase())) return true;
  if (/^[0-9a-f]{7,40}$/i.test(e) && idx.commits.some((c) => c.startsWith(e.toLowerCase()))) return true;
  // "Path:line" or "Class:Method" style references
  const head = e.split(/[:#]/)[0]!;
  if (head !== e && (idx.stripped.has(head) || idx.symbols.has(head))) return true;
  return false;
}

const wordsOf = (a: Analysis) => new Set(JSON.stringify([a.impact, a.plan, a.tasks]).match(/[A-Za-z_]\w*/g) ?? []);

/**
 * Check that nothing in the analysis is invented (plan §15.1/§15.4): impact paths, evidence references, process
 * names, test-called methods and task routing are all resolved against the pinned snapshot.
 */
export function checkGrounding(a: Analysis, i: RepoIndex): GroundingIssue[] {
  const idx = entityIndex(i), out: GroundingIssue[] = [];
  const issue = (level: GroundingIssue['level'], kind: string, where: string, message: string) => out.push({ level, kind, where, message });

  a.impact.forEach((x, n) => {
    const exists = !!i.resolve(x.path);
    if (x.change !== 'new' && !exists) issue('error', 'invented-path', `impact[${n}]`, `"${x.path}" is not a file in this snapshot`);
    if (x.change === 'new' && exists) issue('warn', 'new-but-exists', `impact[${n}]`, `"${x.path}" already exists; expected "modify"`);
    x.evidence.forEach((ev, k) => { if (!resolveEvidence(ev, i, idx)) issue('warn', 'unresolved-evidence', `impact[${n}].evidence[${k}]`, `"${ev}" does not resolve`); });
  });
  a.risks.forEach((r, n) => {
    const resolved = r.evidence.filter((e) => resolveEvidence(e, i, idx));
    if (!resolved.length) issue('error', 'ungrounded-risk', `risks[${n}]`, `"${r.title}" cites no evidence that exists in this snapshot`);
    r.evidence.filter((e) => !resolveEvidence(e, i, idx)).forEach((e) => issue('warn', 'unresolved-evidence', `risks[${n}]`, `"${e}" does not resolve`));
  });
  a.processes.forEach((p, n) => {
    if (!idx.processes.has(p.process.toLowerCase())) issue('error', 'invented-process', `processes[${n}]`, `"${p.process}" is not a process in this snapshot`);
  });
  a.tables.forEach((t, n) => { if (t.change !== 'add field' && !idx.tables.has(t.table.toLowerCase())) issue('warn', 'unknown-table', `tables[${n}]`, `"${t.table}" is not a table here`); });
  a.tasks.forEach((t, n) => {
    for (const f of t.files) if (!i.resolve(f) && !a.impact.some((x) => x.path === f)) issue('warn', 'unknown-task-file', `tasks[${n}]`, `"${f}" is neither an existing file nor in the impact list`);
    if (/^(decision|spike|clarif)/i.test(t.type) && t.system !== 'Taskmanager') issue('warn', 'task-routing', `tasks[${n}]`, `"${t.title}" is a ${t.type}; decisions and clarifications belong in Taskmanager`);
    if (/^(story|task|bug|test|schema|build|implementation)/i.test(t.type) && t.system !== 'Jira') issue('warn', 'task-routing', `tasks[${n}]`, `"${t.title}" is a ${t.type}; build, schema and test work belongs in Jira`);
  });
  // tests may only call methods that exist or that the plan proposes
  const proposed = wordsOf(a);
  a.tests.forEach((t, n) => {
    const bad = new Set<string>();
    for (const m of t.code.matchAll(/:\s*([A-Za-z_]\w*)\s*\(/g)) {
      const name = m[1]!;
      if (!idx.methods.has(name) && !BUILTIN_METHODS.has(name) && !proposed.has(name) && name !== t.name) bad.add(name);
    }
    for (const b of bad) issue('error', 'invented-method', `tests[${n}]`, `test "${t.name}" calls ${b}(), which is neither in the repository nor proposed by the plan`);
    if (!/(^|\/)tests\//.test(t.file) && !/Test/.test(t.file)) issue('warn', 'test-location', `tests[${n}]`, `"${t.file}" is not under the tests layer`);
  });
  return out;
}

export const groundingErrors = (i: GroundingIssue[]) => i.filter((x) => x.level === 'error');

/** Remove what cannot be grounded rather than presenting it as fact; returns what was dropped. */
export function enforceGrounding(a: Analysis, i: RepoIndex): { analysis: Analysis; dropped: GroundingIssue[]; issues: GroundingIssue[] } {
  const issues = checkGrounding(a, i);
  const bad = new Set(groundingErrors(issues).map((x) => x.where));
  const idx = entityIndex(i);
  const analysis: Analysis = {
    ...a,
    impact: a.impact.filter((_, n) => !bad.has(`impact[${n}]`)),
    risks: a.risks.filter((_, n) => !bad.has(`risks[${n}]`)),
    processes: a.processes.filter((_, n) => !bad.has(`processes[${n}]`)),
    tests: a.tests.filter((_, n) => !bad.has(`tests[${n}]`)),
  };
  analysis.risks = analysis.risks.map((r) => ({ ...r, evidence: r.evidence.filter((e) => resolveEvidence(e, i, idx)) }));
  return { analysis, dropped: groundingErrors(issues), issues };
}
