import Link from 'next/link';
import { compareAnalyses, getProject } from '@lens/services';
import { getCtx } from '@/lib/ctx';
import { guard, requireActor } from '@/lib/session';
import { fmtDateTime } from '@/components/ui';

const List = ({ title, added, removed }: { title: string; added: string[]; removed: string[] }) => (
  <div className="detail-card">
    <h3>{title}</h3>
    {added.length + removed.length === 0 ? <p className="muted">No difference.</p> : (
      <ul>{added.map((x) => <li key={`+${x}`}><b aria-label="added">+</b> {x}</li>)}{removed.map((x) => <li key={`-${x}`}><b aria-label="removed">−</b> {x}</li>)}</ul>
    )}
  </div>
);

/** What moved between two analysis versions of a project (plan §26 M9: compare versions). */
export default async function Compare({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const { actor } = await requireActor();
  const { id } = await params;
  const sp = await searchParams;
  const ctx = getCtx();
  const p = await guard(() => getProject(ctx, actor, id));
  const [from, to] = [p.analyses.find((a) => a.id === sp.from), p.analyses.find((a) => a.id === sp.to)];
  if (!from || !to) return <section className="panel"><h2>Compare versions</h2><p>Pick two versions from the project page.</p><Link href={`/projects/${id}`}>Back to the project</Link></section>;
  const c = await guard(() => compareAnalyses(ctx, actor, from.id, to.id));
  return (
    <section className="panel" aria-labelledby="h-cmp">
      <p><Link href={`/projects/${id}`}>← {p.name}</Link></p>
      <h2 id="h-cmp">Version {from.version} → version {to.version}</h2>
      <p className="muted">
        v{from.version}: Git SHA <code>{c.from.sha.slice(0, 7)}</code>, {fmtDateTime(from.createdAt)} · v{to.version}: Git SHA <code>{c.to.sha.slice(0, 7)}</code>, {fmtDateTime(to.createdAt)}
      </p>
      {c.snapshotChanged ? <div className="stale">These versions were produced from <b>different snapshots</b> of the source, so differences may come from repository changes as well as from the requirement or the analysis.</div> : <div className="fresh-ok">Both versions use the same snapshot.</div>}
      <div className="grid2">
        <List title="Files affected" added={c.impact.added} removed={c.impact.removed} />
        <List title="Risks" added={c.risks.added} removed={c.risks.removed} />
        <List title="Tasks" added={c.tasks.added} removed={c.tasks.removed} />
      </div>
    </section>
  );
}
