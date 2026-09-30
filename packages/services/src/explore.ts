import { placeIncidents } from '@lens/impact';
import { purposeOf, camelWords } from '@lens/ingest';
import type { Actor, Ctx } from './context';
import { notFound } from './context';
import { requireSource, visibleSources } from './access';
import { loadFileText, loadModel, type Model } from './model';

const isOpen = (status: string) => !/resolved|closed|done|fixed/i.test(status);

/** How current a source is (plan §3.4): shown on every source page and on every analysis. */
export function sourceBanner(m: Model) {
  return { sourceId: m.source.id, name: m.source.name, sha: m.snapshot.sha, shortSha: m.snapshot.sha.slice(0, 7), syncedAt: m.snapshot.activatedAt, snapshotId: m.snapshot.id };
}

export async function overview(ctx: Ctx, actor: Actor) {
  const sources = await visibleSources(ctx, actor);
  const groups = new Map<string, { source: string; sourceId: string; name: string; steps: number; changes: number; incidents: number; openIncidents: number; lastActivity: string | null }[]>();
  const banners = [];
  for (const s of sources) {
    let m: Model;
    try { m = await loadModel(ctx, s.id); } catch { continue; } // not synced yet
    banners.push(sourceBanner(m));
    const placed = placeIncidents(m.view);
    for (const p of m.view.processes) {
      const files = new Set(p.steps.flatMap((st) => st.files));
      const touching = m.commits.filter((c) => c.files.length <= 20 && c.files.some((f) => files.has(f.path)));
      const inc = placed.placed.filter((x) => x.process === p.name);
      const keys = new Set(inc.map((x) => x.incident));
      const open = m.incidents.filter((i) => keys.has(i.key) && isOpen(i.status)).length;
      const row = { source: s.name, sourceId: s.id, name: p.name, steps: p.steps.length, changes: touching.length, incidents: keys.size, openIncidents: open, lastActivity: touching.at(-1)?.date ?? null };
      groups.set(s.vertical, [...(groups.get(s.vertical) ?? []), row]);
    }
  }
  return { verticals: [...groups].map(([vertical, processes]) => ({ vertical, processes })), sources: banners };
}

export async function processDetail(ctx: Ctx, actor: Actor, sourceId: string, processName: string) {
  await requireSource(ctx, actor, 'source.view', sourceId);
  const m = await loadModel(ctx, sourceId);
  const pr = m.view.processes.find((p) => p.name === processName);
  if (!pr) throw notFound('Process not found.');
  const node = m.graph.processes.find((p) => p.name === processName)!;
  const placed = placeIncidents(m.view).placed.filter((x) => x.process === processName);
  const reqTitle = new Map(m.graph.requirements.map((r) => [r.code, r.title]));
  const stepEdges = (n: number) => m.graph.edges.filter((e) => e.from === `step:${processName}#${n}`);
  const steps = pr.steps.map((st) => ({
    n: st.n, name: st.name, requirement: st.req ? { code: st.req, title: reqTitle.get(st.req) ?? '' } : null, files: st.files, rules: st.rules, tables: st.tables,
    incidents: placed.filter((x) => x.step === st.n).map((x) => x.incident),
    relationships: stepEdges(st.n).map((e) => ({ type: e.type, to: e.to, origin: e.origin, confidence: e.confidence, reason: e.evidence?.reason ?? null })),
  }));
  const fileToSteps = new Map<string, number[]>();
  for (const st of pr.steps) for (const f of st.files) fileToSteps.set(f, [...(fileToSteps.get(f) ?? []), st.n]);
  const tickets = new Map(m.tickets.map((t) => [t.commit, t.key]));
  const timeline = m.commits.filter((c) => c.files.length <= 20 && c.files.some((f) => fileToSteps.has(f.path))).map((c) => ({
    sha: c.sha, short: c.sha.slice(0, 7), date: c.date, subject: c.subject, branch: c.branch ?? null, ticket: tickets.get(c.sha) ?? null,
    steps: [...new Set(c.files.flatMap((f) => fileToSteps.get(f.path) ?? []))].sort((a, b) => a - b),
  })).reverse();
  return { banner: sourceBanner(m), name: processName, origin: node.origin, description: node.description ?? null, docPath: node.docPath ?? null, steps, timeline, incidents: m.incidents.filter((i) => placed.some((x) => x.incident === i.key)) };
}

/** History and incidents (plan §18): a panel per process sorted by incident count, plus the unlinked ones. */
export async function history(ctx: Ctx, actor: Actor) {
  const sources = await visibleSources(ctx, actor);
  const panels: { source: string; sourceId: string; process: string; incidents: { key: string; title: string; severity: string; status: string; rootCause: string; fixTicket: string | null; steps: number[] }[] }[] = [];
  const unlinked: { source: string; sourceId: string; key: string; title: string; severity: string; status: string; rootCause: string; files: string[] }[] = [];
  for (const s of sources) {
    let m: Model; try { m = await loadModel(ctx, s.id); } catch { continue; }
    const { placed, unlinked: ul } = placeIncidents(m.view);
    for (const p of m.view.processes) {
      const mine = [...new Set(placed.filter((x) => x.process === p.name).map((x) => x.incident))];
      panels.push({ source: s.name, sourceId: s.id, process: p.name, incidents: mine.map((k) => { const i = m.incidents.find((x) => x.key === k)!; return { key: i.key, title: i.title, severity: i.severity, status: i.status, rootCause: i.rootCause, fixTicket: i.fixTicket, steps: placed.filter((x) => x.process === p.name && x.incident === k).map((x) => x.step) }; }) });
    }
    for (const k of ul) { const i = m.incidents.find((x) => x.key === k)!; unlinked.push({ source: s.name, sourceId: s.id, key: i.key, title: i.title, severity: i.severity, status: i.status, rootCause: i.rootCause, files: i.files }); }
  }
  return { panels: panels.sort((a, b) => b.incidents.length - a.incidents.length || a.process.localeCompare(b.process)), unlinked };
}

export type EntityKind = 'file' | 'requirement' | 'rule' | 'table' | 'step' | 'ticket' | 'incident' | 'commit';

/** Entity page data (class/requirement/rule/table/step/ticket/incident/commit) with the evidence behind every relationship. */
export async function entity(ctx: Ctx, actor: Actor, sourceId: string, kind: EntityKind, key: string, opts: { includeCode?: boolean } = {}) {
  await requireSource(ctx, actor, 'source.view', sourceId);
  const m = await loadModel(ctx, sourceId);
  const g = m.graph;
  const edgeView = (e: (typeof g.edges)[number]) => ({ type: e.type, from: e.from, to: e.to, origin: e.origin, confidence: e.confidence, reason: e.evidence?.reason ?? null });
  const banner = sourceBanner(m);
  const commitsFor = (path: string) => m.commits.filter((c) => c.files.some((f) => f.path === path)).map((c) => ({ sha: c.sha, short: c.sha.slice(0, 7), date: c.date, subject: c.subject, branch: c.branch ?? null, ticket: m.tickets.find((t) => t.commit === c.sha)?.key ?? null })).reverse();
  const STRUCT = ['uses', 'creates', 'inherits', 'implements', 'runs', 'includes'];

  if (kind === 'file') {
    const f = g.files.find((x) => x.path === key);
    if (!f) throw notFound('File not found.');
    const v = m.view.files.get(key);
    const sym = g.symbols.find((s) => s.file === key);
    const out = g.edges.filter((e) => e.from === `file:${key}`), inc = g.edges.filter((e) => e.to === `file:${key}`);
    const code = opts.includeCode ? await loadFileText(ctx, m.snapshot.id, key) : undefined;
    return {
      banner, kind, key, title: sym?.name ?? key.split('/').pop()!, path: key, fileKind: v?.kind ?? f.kind, layer: f.layer ?? null, loc: f.loc, purpose: purposeOf(f.header), header: f.header ?? null,
      symbol: sym ? { fqn: sym.fqn, inherits: sym.inherits ?? null, implements: sym.implements, methods: sym.methods, tests: sym.tests } : null,
      dependencies: out.filter((e) => STRUCT.includes(e.type)).map(edgeView), dependents: inc.filter((e) => STRUCT.includes(e.type)).map(edgeView), directTests: inc.filter((e) => e.type === 'tests').map(edgeView),
      requirements: out.filter((e) => e.type === 'implements-req').map(edgeView), rules: out.filter((e) => e.type === 'enforces').map(edgeView), tables: out.filter((e) => e.type.startsWith('db-') || e.type === 'mirrors').map(edgeView),
      steps: inc.filter((e) => e.type === 'maps-step-file').map(edgeView),
      metrics: g.metrics.find((x) => x.path === key) ?? null, history: commitsFor(key), incidents: m.incidents.filter((i) => i.files.includes(key)), code,
    };
  }
  if (kind === 'requirement' || kind === 'rule') {
    const code = key;
    const r = g.requirements.find((x) => x.code === code);
    const rc = g.ruleCodes.find((x) => x.code === code);
    if (!r && !rc) throw notFound('Not found.');
    const ref = `${r && r.kind === 'requirement' ? 'req' : 'rule'}:${code}`;
    const inc = g.edges.filter((e) => e.to === ref);
    return { banner, kind, key, title: r?.title ?? rc?.trace ?? code, requirement: r ?? null, ruleCode: rc ?? null, implementedBy: inc.filter((e) => e.type === 'implements-req' || e.type === 'enforces').map(edgeView), steps: inc.filter((e) => e.type === 'maps-step-req' || e.type === 'maps-step-rule').map(edgeView), incidents: m.incidents.filter((i) => i.reqs.includes(code)), tickets: m.tickets.filter((t) => t.reqs.includes(code)) };
  }
  if (kind === 'table') {
    const t = g.tables.find((x) => x.name.toLowerCase() === key.toLowerCase());
    if (!t) throw notFound('Table not found.');
    const inc = g.edges.filter((e) => e.to === `table:${t.name.toLowerCase()}`);
    return { banner, kind, key: t.name, title: t.name, table: t, usedBy: inc.filter((e) => e.type.startsWith('db-')).map(edgeView), mirroredBy: inc.filter((e) => e.type === 'mirrors').map(edgeView), steps: inc.filter((e) => e.type === 'maps-step-table').map(edgeView) };
  }
  if (kind === 'step') {
    const [proc, n] = key.split('#');
    const p = g.processes.find((x) => x.name === proc), st = p?.steps.find((s) => s.n === Number(n));
    if (!p || !st) throw notFound('Step not found.');
    const es = g.edges.filter((e) => e.from === `step:${key}`);
    return { banner, kind, key, title: `${st.n}. ${st.name}`, process: p.name, step: st, relationships: es.map(edgeView), incidents: placeIncidents(m.view).placed.filter((x) => x.process === proc && x.step === st.n).map((x) => m.incidents.find((i) => i.key === x.incident)!) };
  }
  if (kind === 'ticket') {
    const t = m.tickets.find((x) => x.key === key);
    if (!t) throw notFound('Ticket not found.');
    const c = m.commits.find((x) => x.sha === t.commit);
    return { banner, kind, key, title: t.title, ticket: t, commit: c ? { sha: c.sha, short: c.sha.slice(0, 7), date: c.date, subject: c.subject, branch: c.branch ?? null, files: c.files } : null };
  }
  if (kind === 'incident') {
    const i = m.incidents.find((x) => x.key === key);
    if (!i) throw notFound('Incident not found.');
    return { banner, kind, key, title: i.title, incident: i, steps: placeIncidents(m.view).placed.filter((x) => x.incident === key), unresolvedFiles: i.files.filter((p) => !m.view.files.has(p)) };
  }
  const c = m.commits.find((x) => x.sha === key || x.sha.startsWith(key));
  if (!c) throw notFound('Commit not found.');
  return { banner, kind, key: c.sha, title: c.subject, commit: { ...c, short: c.sha.slice(0, 7) }, ticket: m.tickets.find((t) => t.commit === c.sha) ?? null };
}

/** Search across every visible source: classes, requirements, rules, tables, tickets, incidents and commits (plan §17.2). */
export async function search(ctx: Ctx, actor: Actor, q: string, limit = 60, perKind = 8) {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];
  const words = camelWords(needle);
  const out: { kind: EntityKind; key: string; title: string; detail: string; sourceId: string; source: string; score: number }[] = [];
  const hit = (text: string) => { const t = text.toLowerCase(); return t.includes(needle) ? (t.startsWith(needle) ? 3 : 2) : words.length > 1 && words.every((w) => t.includes(w)) ? 1 : 0; };
  for (const s of await visibleSources(ctx, actor)) {
    let m: Model; try { m = await loadModel(ctx, s.id); } catch { continue; }
    const add = (kind: EntityKind, key: string, title: string, detail: string, text: string) => { const sc = hit(text); if (sc) out.push({ kind, key, title, detail, sourceId: s.id, source: s.name, score: sc }); };
    for (const f of m.view.files.values()) add('file', f.path, f.name, `${f.kind} · ${f.path}`, `${f.name} ${f.path} ${f.methods.join(' ')}`);
    for (const r of m.graph.requirements) add(r.kind === 'rule' ? 'rule' : 'requirement', r.code, `${r.code} ${r.title}`, r.kind, `${r.code} ${r.title}`);
    for (const r of m.graph.ruleCodes) add('rule', r.code, r.code, r.impl, `${r.code} ${r.impl}`);
    for (const t of m.graph.tables) if (t.type === 'table') add('table', t.name, t.name, `${t.fields.length} fields`, `${t.name} ${t.fields.map((f) => f.name).join(' ')}`);
    for (const t of m.tickets) add('ticket', t.key, `${t.key} ${t.title}`, t.taskmanager, `${t.key} ${t.taskmanager} ${t.title}`);
    for (const i of m.incidents) add('incident', i.key, `${i.key} ${i.title}`, i.status, `${i.key} ${i.title} ${i.rootCause}`);
    for (const c of m.commits) add('commit', c.sha, c.subject, c.sha.slice(0, 7), `${c.sha} ${c.subject}`);
  }
  // cap per entity kind so classes cannot crowd out requirements, rules, tables, tickets, incidents and commits
  const ranked = out.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  const seen = new Map<string, number>();
  return ranked.filter((r) => { const n = (seen.get(r.kind) ?? 0) + 1; seen.set(r.kind, n); return n <= perKind; }).slice(0, limit);
}

