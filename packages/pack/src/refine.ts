/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { Fence, extractJson, type ModelClient } from '@lens/ai';
import { createHash } from 'node:crypto';

const RULE_TYPES = new Set(['gate', 'data', 'rule', 'q']);
const RefinedSchema = z.object({
  steps: z.array(z.object({
    n: z.number().int(),
    title: z.string().min(1).max(120).optional(),
    say: z.string().min(1).max(800).optional(),
    rules: z.array(z.tuple([z.string(), z.string()])).optional(),
    chips: z.array(z.tuple([z.string(), z.string()])).optional(),
  })),
});

const ID_RE = /\b[A-Z]{2,6}-(?:[A-Z]+-)?\d{2,5}\b/g;
const idsOf = (rules: [string, string][]) => rules.flatMap(([, t]) => t.match(ID_RE) ?? []).sort();

export interface Refinement { steps: { n: number; title?: string; say?: string; rules?: [string, string][]; chips?: [string, string][] }[]; rejected: string[] }

/**
 * Wording refinement must not change facts (plan §19.1, rule 10). A refined step is kept only for the parts that
 * pass: rules must keep the same rule/incident ids and the same number of items per type, chips must keep their
 * keys. Everything else falls back to the deterministic text. The spec's screens, trace, history and sample data
 * are never touched by an override.
 */
export function sanitizeRefinement(spec: any, raw: unknown): Refinement {
  const parsed = RefinedSchema.safeParse(raw);
  if (!parsed.success) return { steps: [], rejected: parsed.error.issues.map((i) => i.message) };
  const out: Refinement['steps'] = [], rejected: string[] = [];
  for (const o of parsed.data.steps) {
    const s = spec.steps.find((x: any) => +x.n === o.n);
    if (!s) { rejected.push(`step ${o.n}: no such step`); continue; }
    const keep: Refinement['steps'][number] = { n: o.n };
    if (o.title) keep.title = o.title;
    if (o.say) keep.say = o.say;
    if (o.rules) {
      const orig: [string, string][] = s.rules;
      const sameTypes = o.rules.length === orig.length && [...o.rules.map((r) => r[0])].sort().join() === [...orig.map((r) => r[0])].sort().join() && o.rules.every((r) => RULE_TYPES.has(r[0]));
      const sameIds = JSON.stringify(idsOf(o.rules)) === JSON.stringify(idsOf(orig));
      if (sameTypes && sameIds) keep.rules = o.rules; else rejected.push(`step ${o.n}: refined rules changed the set of rules or ids`);
    }
    if (o.chips) {
      const orig: [string, string][] = s.chips;
      if (o.chips.length === orig.length && JSON.stringify(o.chips.map((c) => c[0])) === JSON.stringify(orig.map((c) => c[0]))) keep.chips = o.chips; else rejected.push(`step ${o.n}: refined chips changed keys`);
    }
    out.push(keep);
  }
  return { steps: out, rejected };
}

/** Hash of everything factual in a spec (wording excluded). Overrides carry forward while this is unchanged. */
export function specHash(spec: any): string {
  const facts = {
    title: spec.title, source: spec.source, commit: spec.commit, roles: spec.roles, sample: spec.sample,
    steps: spec.steps.map((s: any) => ({ n: s.n, screen: s.screen, trace: s.trace, history: s.history, ruleIds: idsOf(s.rules), ruleTypes: s.rules.map((r: any) => r[0]), chipKeys: s.chips.map((c: any) => c[0]) })),
  };
  return createHash('sha256').update(JSON.stringify(facts)).digest('hex');
}

/** One AI call, no tools (plan §19.1). Repository-derived text is fenced as untrusted data. */
export async function refineWording(spec: any, requirementBodies: Record<string, string>, model: ModelClient, signal?: AbortSignal): Promise<{ refinement: Refinement; usage: { inputTokens: number; outputTokens: number } }> {
  const fence = new Fence();
  const input = spec.steps.map((s: any) => ({
    n: +s.n, title: s.title, say: s.say, rules: s.rules, chips: s.chips,
    requirement: s.trace.req ? `${s.trace.req} ${s.trace.reqTitle}: ${requirementBodies[s.trace.req] ?? ''}` : null,
    fields: (s.screen.fields || []).map((d: any) => `${d.label} (${d.type}${d.required ? ', required' : ''})`),
    list: s.screen.list ? s.screen.list.options.map((o: any) => o.code) : null,
    checks: s.screen.checks ? s.screen.checks.map((c: any) => `${c.code}: ${c.text}`) : null,
  }));
  const system = `You write narration for process explainers and prototypes, for business analysts at an insurance software company. You rewrite wording only and never change facts.\n\n${fence.notice}`;
  const user = `The facts below were generated from the code of "${spec.title}" in ${spec.source} (${spec.vertical}). Rewrite them so a business reader understands each step.

Rules for the rewrite:
- Keep every fact. Don't invent screens, fields, rules or behaviour that isn't in the input.
- "title": a short action phrase, sentence case (e.g. "Link the campaign").
- "say": 1-2 plain sentences about what happens and why it matters. No class names.
- "rules": array of [type, text] where type is one of gate, data, rule, q. Keep rule codes (like NB-CAMPAIGN-001) at the start of rule texts. Plain English, one sentence each. Keep the incidents as q items.
- "chips": array of [key, text] describing what the application carries after the step. Keep the keys.

${fence.wrap('process facts', JSON.stringify(input).slice(0, 60000))}

Reply with ONLY JSON: {"steps":[{"n":1,"title":"","say":"","rules":[["gate",""]],"chips":[["key",""]]}]}`;
  const res = await model.complete({ system, messages: [{ role: 'user', content: user }], maxTokens: 8000, signal });
  const text = res.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('\n');
  return { refinement: sanitizeRefinement(spec, extractJson(text)), usage: res.usage };
}
