import Link from 'next/link';
import { can } from '@lens/core';
import { listProjects, listSources } from '@lens/services';
import { getCtx } from '@/lib/ctx';
import { guard, requireActor } from '@/lib/session';
import { fmtDate } from '@/components/ui';

const STATUS = ['DRAFT', 'ANALYSING', 'ANALYSED', 'FAILED'] as const;
const LABEL: Record<string, string> = { DRAFT: 'Draft', ANALYSING: 'Analysing', ANALYSED: 'Analysed', FAILED: 'Failed' };

export default async function Projects({ searchParams }: { searchParams: Promise<{ source?: string; status?: string }> }) {
  const { actor } = await requireActor();
  const sp = await searchParams;
  const status = (STATUS as readonly string[]).includes(sp.status ?? '') ? (sp.status as (typeof STATUS)[number]) : undefined;
  const ctx = getCtx();
  const [projects, sources] = await Promise.all([guard(() => listProjects(ctx, actor, { sourceId: sp.source || undefined, status })), listSources(ctx, actor)]);
  return (
    <section className="panel" aria-labelledby="h-projects">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 id="h-projects">Projects</h2>
        {can('project.create', { role: actor.role, canSeeSource: true }) && <Link className="btn" href="/projects/new">New change</Link>}
      </div>
      <form className="row" method="get" aria-label="Filter projects">
        <div className="field-row"><label htmlFor="f-src">Source</label><select id="f-src" name="source" defaultValue={sp.source ?? ''}><option value="">All sources</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div className="field-row"><label htmlFor="f-st">Status</label><select id="f-st" name="status" defaultValue={status ?? ''}><option value="">Any status</option>{STATUS.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}</select></div>
        <button className="btn ghost small" type="submit">Filter</button>
      </form>
      {projects.length === 0 && <div className="empty-state notice">No projects yet. Describe a business change and Lens will show what it touches.</div>}
      <div className="stack">
        {projects.map((p) => (
          <article className="proj" key={p.id}>
            <h3><Link href={`/projects/${p.id}`}>{p.name}</Link> {p.isExample && <span className="tag sample">Example / Seed data</span>}</h3>
            <p className="muted" style={{ margin: 0 }}>
              <span className="tag">{LABEL[p.status]}</span> {fmtDate(p.createdAt)} · {p.source}
            </p>
            <p style={{ margin: '6px 0 0' }}>
              <b>{p.high}</b> high · <b>{p.medium}</b> medium risks · <b>{p.tasks}</b> tasks · <b>{p.processes}</b> process{p.processes === 1 ? '' : 'es'} affected
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
