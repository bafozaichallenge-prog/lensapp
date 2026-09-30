import Link from 'next/link';
import { history } from '@lens/services';
import { getCtx } from '@/lib/ctx';
import { guard, requireActor } from '@/lib/session';
import { Chip, ProcessRail, entityHref } from '@/components/ui';
import { processDetail } from '@lens/services';

export default async function History() {
  const { actor } = await requireActor();
  const ctx = getCtx();
  const h = await guard(() => history(ctx, actor));
  const details = await Promise.all(h.panels.map((p) => processDetail(ctx, actor, p.sourceId, p.process).catch(() => null)));
  return (
    <section className="panel" aria-labelledby="h-hist">
      <h2 id="h-hist">History and incidents</h2>
      <p className="muted">Incidents are placed on the process steps they affected. Panels are sorted by incident count.</p>
      {h.panels.length === 0 && <div className="notice">No incidents imported yet. A Maintainer can import them from a CSV on the Explore page.</div>}
      {h.panels.map((p, i) => {
        const d = details[i];
        return (
          <article className="detail-card" key={`${p.sourceId}${p.process}`}>
            <h3><Link href={`/explore/${p.sourceId}/process/${encodeURIComponent(p.process)}`}>{p.process}</Link> <span className="muted">({p.source}) · {p.incidents.length} incident{p.incidents.length === 1 ? '' : 's'}</span></h3>
            {d && <ProcessRail name={p.process} steps={d.steps.map((s) => ({ n: s.n, name: s.name, incidents: s.incidents.length }))} href={(n) => entityHref(p.sourceId, 'step', `${p.process}#${n}`)} />}
            {p.incidents.length > 0 && <div className="tbl-wrap"><table><thead><tr><th>Incident</th><th>Severity</th><th>Status</th><th>Steps</th><th>Root cause</th><th>Fix</th></tr></thead><tbody>
              {p.incidents.map((n) => <tr key={n.key}><td><Chip sourceId={p.sourceId} kind="incident" k={n.key} cls="inc" /> {n.title}</td><td>{n.severity}</td><td>{n.status}</td><td>{n.steps.join(', ')}</td><td>{n.rootCause}</td><td>{n.fixTicket ? <Chip sourceId={p.sourceId} kind="ticket" k={n.fixTicket} cls="tk" /> : '–'}</td></tr>)}
            </tbody></table></div>}
          </article>
        );
      })}
      {h.unlinked.length > 0 && (
        <article className="detail-card"><h3>Not linked to any process</h3>
          <p className="muted">The files these incidents mention are not part of any process step yet. Add a process step that covers them, or fix the file names in the import.</p>
          <ul>{h.unlinked.map((n) => <li key={`${n.sourceId}${n.key}`}><Chip sourceId={n.sourceId} kind="incident" k={n.key} cls="inc" /> {n.title} <span className="muted">({n.source}) · {n.severity} · {n.status}</span></li>)}</ul></article>
      )}
    </section>
  );
}
