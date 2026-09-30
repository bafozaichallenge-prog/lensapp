import type { ImpactResult, GraphView } from '@lens/impact';
import type { Analysis } from './schema';

export interface CrossCheck {
  matched: string[];
  dependents: string[];
  tests: string[];
  rules: string[];
  incidents: string[];
  tickets: string[];
  processSteps: { name: string; steps: number[] }[];
  /** Graph entities that were found but are absent from the AI plan (plan §16.2). */
  omitted: { matched: string[]; dependents: string[] };
}

/** Deterministic cross-check of an AI plan against the code graph. Used with or without AI. */
export function graphCrossCheck(imp: ImpactResult, view: GraphView, analysis?: Analysis): CrossCheck {
  const planned = new Set<string>();
  for (const x of analysis?.impact ?? []) planned.add(x.path);
  for (const s of analysis?.plan.developer ?? []) for (const f of s.files ?? []) planned.add(f);
  for (const t of analysis?.tasks ?? []) for (const f of t.files) planned.add(f);
  const inPlan = (p: string) => [...planned].some((q) => p === q || p.endsWith('/' + q));
  const rules = [...new Set(imp.seeds.flatMap((p) => view.files.get(p)?.codeRefs ?? []))].sort();
  return {
    matched: imp.seeds, dependents: imp.ripple, tests: imp.tests, rules, incidents: imp.incidents, tickets: imp.tickets, processSteps: imp.processes,
    omitted: analysis ? { matched: imp.seeds.filter((p) => !inPlan(p)), dependents: imp.ripple.filter((p) => !inPlan(p)).slice(0, 10) } : { matched: [], dependents: imp.ripple.slice(0, 10) },
  };
}
