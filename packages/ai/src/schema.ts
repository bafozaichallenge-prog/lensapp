import { z } from 'zod';

export const SCHEMA_VERSION = 1;
export const PROMPT_VERSION = 'lens-analysis-2026-09-a';

const str = z.string();
const strList = z.array(str).default([]);
const Evidence = z.array(str).default([]);

export const Severity = z.enum(['high', 'medium', 'low']);

const PlanStep = z.object({ title: str, detail: str, files: strList.optional() });

export const AnalysisSchema = z.object({
  summary: z.object({ business: str, technical: str }),
  questions: strList,
  processes: z.array(z.object({
    process: str,
    stages: z.array(z.object({ n: z.number().int(), change: z.enum(['none', 'modified']), note: str.optional(), evidence: Evidence })).default([]),
    new_stages: z.array(z.object({ after: z.number().int(), name: str, note: str.optional(), evidence: Evidence })).default([]),
  })).default([]),
  impact: z.array(z.object({ path: str, change: z.enum(['modify', 'new', 'review']), reason: str, evidence: Evidence })).default([]),
  tables: z.array(z.object({ table: str, change: z.enum(['add field', 'modify', 'none']), detail: str })).default([]),
  risks: z.array(z.object({
    title: str,
    severity: z.preprocess((v) => String(v ?? 'medium').toLowerCase(), Severity),
    why: str,
    // Grounding rule 3: every material risk cites at least one evidence reference.
    evidence: z.array(str).min(1, 'each risk needs at least one evidence reference'),
    mitigation: str.default(''),
  })).default([]),
  plan: z.object({
    business: z.array(PlanStep).default([]),
    developer: z.array(PlanStep).default([]),
    qa: z.array(PlanStep).default([]),
    architect: z.array(PlanStep).default([]),
  }),
  tasks: z.array(z.object({
    id: str, system: z.enum(['Jira', 'Taskmanager']), type: str, title: str, description: str.default(''),
    acceptance: strList, files: strList, step: str.optional(), owner: str.default(''),
    priority: z.enum(['High', 'Medium', 'Low']).default('Medium'), depends_on: strList,
  })).max(12).default([]),
  tests: z.array(z.object({ name: str, file: str, kind: z.enum(['new', 'update']), purpose: str, code: str })).default([]),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

/** Prototype output shape, shown to the model. Evidence is requested as Lens entity refs/paths. */
export const SHAPE = `{
 "summary": {"business": "plain language for a non-technical business analyst, no class names, max 120 words", "technical": "for developers/architects, max 120 words"},
 "questions": ["3-6 questions that must be answered before building"],
 "processes": [{"process": "exact process name from PROCESSES", "stages": [{"n": 1, "change": "none|modified", "note": "one sentence, required when modified", "evidence": ["ids or paths"]}], "new_stages": [{"after": 5, "name": "short step name", "note": "one sentence", "evidence": ["ids or paths"]}]}],
 "impact": [{"path": "exact path from the FILE INDEX, or a new path you propose", "change": "modify|new|review", "reason": "one sentence", "evidence": ["ids or paths"]}],
 "tables": [{"table": "TableName", "change": "add field|modify|none", "detail": "one sentence"}],
 "risks": [{"title": "short", "severity": "high|medium|low", "why": "2-3 sentences grounded in the code/history", "evidence": ["file paths, requirement or rule ids, ticket ids, incident ids or commit ids"], "mitigation": "one sentence"}],
 "plan": {"business": [{"title": "", "detail": ""}], "developer": [{"title": "", "detail": "", "files": ["paths"]}], "qa": [{"title": "", "detail": ""}], "architect": [{"title": "", "detail": ""}]},
 "tasks": [{"id": "T1", "system": "Jira|Taskmanager", "type": "Story|Task|Bug|Test|Spike|Decision", "title": "imperative, under 80 characters", "description": "2-3 sentences", "acceptance": ["testable done-when statements"], "files": ["paths"], "step": "process name and step number, if any", "owner": "BA|Developer|QA|Architect", "priority": "High|Medium|Low", "depends_on": ["T0"]}],
 "tests": [{"name": "MethodName", "file": "tests/... .cls", "kind": "new|update", "purpose": "one sentence", "code": "full ABLUnit @Test. method, 4-space indent"}]
}`;

const RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

/** Prototype normalize(): every known process step present, risks ranked by severity. Unknown process names are dropped. */
export function normalizeAnalysis(a: Analysis, processes: { name: string; steps: { n: number }[] }[]): Analysis {
  const known = new Map(processes.map((p) => [p.name.toLowerCase(), p]));
  const procs = a.processes.flatMap((p) => {
    const kp = known.get(p.process.toLowerCase());
    if (!kp) return [];
    const byN = new Map(p.stages.map((s) => [s.n, s]));
    return [{ ...p, process: kp.name, stages: kp.steps.map((s) => byN.get(s.n) ?? { n: s.n, change: 'none' as const, evidence: [] }) }];
  });
  return { ...a, processes: procs, risks: [...a.risks].sort((x, y) => (RANK[x.severity] ?? 1) - (RANK[y.severity] ?? 1)) };
}

/** Pull the first balanced JSON object out of a model reply (tolerates prose or code fences around it). */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  if (start < 0) throw new Error('no JSON object in the reply');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i]!;
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  throw new Error('unterminated JSON object');
}

export function validateAnalysis(raw: unknown): { ok: true; value: Analysis } | { ok: false; errors: string[] } {
  const r = AnalysisSchema.safeParse(raw);
  if (r.success) return { ok: true, value: r.data };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
}
