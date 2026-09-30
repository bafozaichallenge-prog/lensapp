import { camelWords, purposeOf } from '@lens/ingest';
import { STRUCT, CODE_KINDS, type GraphView } from './view';

/** Prototype STOP words and domain synonym map (tokens()). */
export const STOP = new Set('that this with from have will want they their them into then than when where which should could would about also only each every other there these those being been must allow able make made more most some such very what just like need needs instead limited choose clients client contract contracts shall system user users requirement requirements business'.split(' '));
export const SYN: Record<string, string[]> = { debit: ['collection'], order: ['collection'], payroll: ['collection'], collect: ['collection'], collected: ['collection'], day: ['collection'], month: ['collection'], cover: ['benefit'], sum: ['benefit'], assured: ['benefit'], premium: ['premium', 'benefit'], refund: ['cancel', 'contract'], cancel: ['cancel'], cancelled: ['cancel'], cooling: ['cancel', 'activate'], activate: ['activate'], activation: ['activate'], approve: ['activate'], supervisor: ['user', 'context'], owner: ['person', 'owner'], spouse: ['person', 'benefit'], promotion: ['campaign'], expiry: ['campaign'], expired: ['campaign'], report: ['report', 'status'], extract: ['export', 'csv'], age: ['person', 'birth'], beneficiary: ['person', 'benefit'], email: ['person'], mobile: ['person'], claim: ['claim'], member: ['member', 'person'], loan: ['loan'], annuity: ['annuity'] };

/** Tokenise requirement text: stop words, stemming (ies→y, ing/ed/s), domain synonyms. */
export function tokens(text: string): string[] {
  const base = [...new Set(text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).filter((w) => w.length >= 3 && !STOP.has(w)))].slice(0, 400);
  const out = new Set<string>();
  for (const w of base) {
    const st = w.replace(/(ies)$/, 'y').replace(/(ing|ed|s)$/, '');
    if (st.length >= 3) out.add(st);
    for (const x of SYN[w] ?? SYN[st] ?? []) out.add(x);
  }
  return [...out];
}

/** Word bag per non-test code file: file name 3, method names 2, header words 1 (prototype bagsOf). */
export function bagsOf(v: GraphView): Map<string, Map<string, number>> {
  const bags = new Map<string, Map<string, number>>();
  for (const [p, f] of v.files) {
    if (!CODE_KINDS.has(f.kind) || f.layer === 'tests') continue;
    const b = new Map<string, number>();
    const add = (w: string, wt: number) => b.set(w, Math.max(b.get(w) ?? 0, wt));
    camelWords(f.name).forEach((w) => add(w, 3));
    f.methods.forEach((m) => camelWords(m).forEach((w) => add(w, 2)));
    purposeOf(f.header).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3).forEach((w) => add(w, 1));
    bags.set(p, b);
  }
  return bags;
}

export interface MatchEvidence { token: string; word: string; weight: number; via: 'file name' | 'method name' | 'header' }
export interface ImpactSeed { path: string; score: number; evidence: MatchEvidence[] }
export interface ImpactResult {
  score: number;
  seeds: string[];
  seedDetail: ImpactSeed[];
  ripple: string[];
  tests: string[];
  processes: { name: string; steps: number[] }[];
  incidents: string[];
  tickets: string[];
}

const viaOf = (wt: number): MatchEvidence['via'] => wt >= 3 ? 'file name' : wt === 2 ? 'method name' : 'header';

/**
 * Deterministic change-impact analysis ported from the prototype impactIn(). Keeps files scoring
 * >= 3 and >= 40% of the best score (max 8), then adds dependents, direct tests, affected process steps,
 * incidents and tickets. Every seed carries the token->word matches that produced its score.
 */
export function impactIn(v: GraphView, text: string): ImpactResult {
  const bags = bagsOf(v), tk = tokens(text);
  const scored: ImpactSeed[] = [];
  for (const [p, b] of bags) {
    let sc = 0; const ev: MatchEvidence[] = [];
    for (const t of tk) {
      let best = 0, bw = '';
      for (const [w, wt] of b) if (w === t || (t.length >= 5 && (w.startsWith(t) || (t.startsWith(w) && w.length >= 5)))) { if (wt > best) { best = wt; bw = w; } }
      if (best) { sc += best; ev.push({ token: t, word: bw, weight: best, via: viaOf(best) }); }
    }
    if (v.files.get(p)?.kind === 'interface') sc *= 0.7;
    if (sc > 0) scored.push({ path: p, score: sc, evidence: ev });
  }
  scored.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const max = scored[0]?.score ?? 0;
  const top = scored.filter((s) => s.score >= Math.max(3, max * 0.4)).slice(0, 8);
  const seeds = top.map((s) => s.path), seedSet = new Set(seeds);
  const deps = (p: string) => [...new Set((v.incoming.get(p) ?? []).filter((e) => STRUCT.has(e.type)).map((e) => e.from))];
  const ripple = [...new Set(seeds.flatMap(deps))]
    .filter((p) => !seedSet.has(p) && v.files.get(p) && v.files.get(p)!.layer !== 'tests' && !/Bootstrap/.test(p))
    .sort((a, b) => v.files.get(b)!.fanIn - v.files.get(a)!.fanIn || a.localeCompare(b)).slice(0, 12);
  const tests = [...new Set(seeds.flatMap((p) => v.files.get(p)!.testedBy))].sort();
  const processes = v.processes.map((pr) => ({
    name: pr.name,
    steps: pr.steps.filter((st) => seeds.some((p) => st.files.includes(p) || v.files.get(p)!.codeRefs.some((c) => st.rules.includes(c)))).map((st) => st.n),
  })).filter((x) => x.steps.length);
  const incidents = v.incidents.filter((i) => i.files.some((p) => seedSet.has(p))).map((i) => i.key);
  const tickets = v.tickets.filter((t) => { const c = v.commits.find((x) => x.sha === t.commit); return c && c.files.some((x) => seedSet.has(x.path)); }).map((t) => t.key);
  return { score: top.reduce((a, s) => a + s.score, 0), seeds, seedDetail: top, ripple, tests, processes, incidents, tickets };
}

/** Prototype incidentsForStageIn: incident files overlap the step's files, or share its requirement. */
export const incidentsForStep = (incidents: GraphView['incidents'], step: { files: string[]; req: string | null }) =>
  incidents.filter((i) => i.files.some((p) => step.files.includes(p)) || (step.req && i.reqs.includes(step.req)));

/** Pick the highest-scoring source for a requirement (plan §14.2). */
export function bestSource<T extends { id: string; view: GraphView }>(sources: T[], text: string): { source: T; impact: ImpactResult } | null {
  let best: { source: T; impact: ImpactResult } | null = null;
  for (const s of sources) { const impact = impactIn(s.view, text); if (!best || impact.score > best.impact.score) best = { source: s, impact }; }
  return best && best.impact.score > 0 ? best : null;
}

export interface IncidentPlacement { process: string; step: number; incident: string }

/** Place incidents on the process steps they affected (plan §2.3); anything unplaceable is returned as `unlinked`. */
export function placeIncidents(v: GraphView): { placed: IncidentPlacement[]; unlinked: string[] } {
  const placed: IncidentPlacement[] = [];
  const linked = new Set<string>();
  for (const pr of v.processes) for (const st of pr.steps) for (const i of incidentsForStep(v.incidents, st)) {
    placed.push({ process: pr.name, step: st.n, incident: i.key }); linked.add(i.key);
  }
  return { placed, unlinked: v.incidents.filter((i) => !linked.has(i.key)).map((i) => i.key).sort() };
}
