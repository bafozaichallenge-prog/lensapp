import { createHash } from 'node:crypto';
import { refineWording, sanitizeRefinement, buildSpec, sandboxConfig, toYaml, docMarkdown, artefactHtml, specHash, toPackGraph, SpecCache, type PGraph, type Theme } from '@lens/pack';
import { audit } from './audit';
import { badRequest, notFound, type Actor, type Ctx } from './context';
import { requireSource } from './access';
import { loadModel, loadRepoIndex, type Model } from './model';

const cache = new SpecCache();

function packGraph(m: Model, files: { path: string; text: string }[]): PGraph {
  return toPackGraph({
    graph: m.graph, view: m.view, files, commits: m.commits,
    tickets: m.tickets.map((t) => ({ key: t.key, commit: t.commit })),
    incidents: m.incidents.map((i) => ({ key: i.key, title: i.title, status: i.status, severity: i.severity, rootCause: i.rootCause, files: i.files, reqs: i.reqs })),
  });
}

async function build(ctx: Ctx, sourceId: string, processName: string) {
  const m = await loadModel(ctx, sourceId);
  const idx = await loadRepoIndex(ctx, m);
  const files = [...idx.texts].map(([path, text]) => ({ path, text }));
  const g = packGraph(m, files);
  const pi = g.processes.findIndex((p) => p.name === processName);
  if (pi < 0) throw notFound('Process not found.');
  const opt = { source: m.source.name, vertical: m.source.vertical, generatedAt: m.snapshot.activatedAt?.toISOString() ?? new Date(0).toISOString() };
  // deterministic base spec (cached by process + snapshot); wording overrides are layered on top
  const base = cache.get(g, pi, m.snapshot.sha, opt);
  const hash = specHash(base);
  const ov = await ctx.db.packOverride.findFirst({ where: { sourceId, processName }, orderBy: { createdAt: 'desc' } });
  const fresh = ov && ov.specHash === hash ? ov : null;
  const spec = fresh ? buildSpec(g, pi, { ...opt, override: { steps: fresh.stepsJson as never } }) : base;
  return { m, g, pi, spec, hash, override: ov, overrideStale: !!ov && !fresh, opt };
}

/** Process pack: deterministic spec from the graph, cached by process + snapshot SHA; regenerated after a new snapshot. */
export async function getPack(ctx: Ctx, actor: Actor, sourceId: string, processName: string) {
  await requireSource(ctx, actor, 'source.view', sourceId);
  const b = await build(ctx, sourceId, processName);
  const cfg = sandboxConfig(b.g, b.pi, b.spec, { source: b.opt.source, vertical: b.opt.vertical });
  return { spec: b.spec, config: cfg, refined: !!b.spec.refined, overrideStale: b.overrideStale, sha: b.m.snapshot.sha, snapshotId: b.m.snapshot.id, specHash: b.hash };
}

export type PackArtefact = 'doc' | 'explainer' | 'prototype' | 'markdown' | 'config-yaml' | 'config-json';
const MIME: Record<PackArtefact, string> = { doc: 'text/html; charset=utf-8', explainer: 'text/html; charset=utf-8', prototype: 'text/html; charset=utf-8', markdown: 'text/markdown; charset=utf-8', 'config-yaml': 'text/yaml; charset=utf-8', 'config-json': 'application/json; charset=utf-8' };

/** One downloadable/viewable artefact. HTML is rendered in a sandboxed iframe by the UI (allow-scripts, no same-origin). */
export async function renderPackArtefact(ctx: Ctx, actor: Actor, sourceId: string, processName: string, kind: PackArtefact, theme: Theme = 'light') {
  await requireSource(ctx, actor, 'download', sourceId);
  const b = await build(ctx, sourceId, processName);
  const slug = processName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (kind === 'doc' || kind === 'explainer' || kind === 'prototype') return { body: artefactHtml(kind, b.spec, theme), mime: MIME[kind], filename: `${slug}-${kind === 'doc' ? 'explainer' : kind}.html` };
  if (kind === 'markdown') return { body: docMarkdown(b.spec), mime: MIME[kind], filename: `${slug}-explainer.md` };
  const cfg = sandboxConfig(b.g, b.pi, b.spec, { source: b.opt.source, vertical: b.opt.vertical });
  return kind === 'config-yaml' ? { body: toYaml(cfg), mime: MIME[kind], filename: `${slug}.sandbox.yaml` } : { body: JSON.stringify(cfg, null, 2), mime: MIME[kind], filename: `${slug}.sandbox.json` };
}

export async function enqueuePackRefine(ctx: Ctx, actor: Actor, sourceId: string, processName: string) {
  const source = await requireSource(ctx, actor, 'pack.refine', sourceId);
  if (!ctx.ai || !ctx.makeModel()) throw badRequest('AI is not configured, so wording cannot be refined.');
  if (!source.aiAllowed) throw badRequest('AI is not enabled for this source. An Admin can enable it in the source settings.');
  const id = createHash('sha1').update(`${sourceId}|${processName}|${Date.now()}`).digest('hex').slice(0, 12);
  await ctx.queue.send('pack-refine', { sourceId, processName, userId: actor.id, jobId: id });
  return { jobId: id };
}

/**
 * Worker: one AI call, no tools. The reply is sanitised so rule/incident ids, rule counts and chip keys cannot change;
 * the accepted override is saved against the hash of the facts it refined.
 */
export async function runPackRefineJob(ctx: Ctx, d: { sourceId: string; processName: string; userId: string }) {
  const model = ctx.makeModel();
  if (!model) return;
  const b = await build(ctx, d.sourceId, d.processName);
  const base = cache.get(b.g, b.pi, b.m.snapshot.sha, b.opt);
  const bodies = Object.fromEntries(Object.values(b.g.requirements).map((r) => [r.id, r.body]));
  const { refinement } = await refineWording(base, bodies, model);
  if (!refinement.steps.length) throw badRequest(`The refined wording was rejected: ${refinement.rejected.join('; ') || 'nothing usable'}`);
  await ctx.db.packOverride.create({ data: { sourceId: d.sourceId, processName: d.processName, specHash: specHash(base), snapshotId: b.m.snapshot.id, stepsJson: refinement.steps as never, createdBy: d.userId } });
  await audit(ctx, d.userId, 'pack.refine', { type: 'process', id: d.processName }, { sourceId: d.sourceId, accepted: refinement.steps.length, rejected: refinement.rejected.length });
}

// re-exported for tests
export { sanitizeRefinement };
