import Link from 'next/link';
import { entity, type EntityKind } from '@lens/services';
import { getCtx } from '@/lib/ctx';
import { guard, requireActor } from '@/lib/session';
import { Chip, Freshness, Origin, RefChip, fmtDate, fmtDateTime, processHref } from '@/components/ui';

const KINDS = ['file', 'requirement', 'rule', 'table', 'step', 'ticket', 'incident', 'commit'];

/* eslint-disable @typescript-eslint/no-explicit-any */
function Rels({ sourceId, title, rels, dir = 'to' }: { sourceId: string; title: string; rels: any[]; dir?: 'to' | 'from' }) {
  if (!rels?.length) return null;
  return (
    <div className="fact"><h4>{title}</h4>
      <ul>{rels.map((e: any, i: number) => (
        <li key={i}><RefChip sourceId={sourceId} refStr={dir === 'to' ? e.to : e.from} /> <span className="tag">{e.type}</span> <Origin origin={e.origin} confidence={e.confidence} reason={e.reason} />{e.reason && <span className="evidence"> — {e.reason}</span>}</li>
      ))}</ul></div>
  );
}

export default async function EntityPage({ params }: { params: Promise<{ sourceId: string; kind: string; key: string[] }> }) {
  const { user, actor } = await requireActor();
  const p = await params;
  if (!KINDS.includes(p.kind)) return <div className="panel"><h2>Not found</h2></div>;
  const key = p.key.map(decodeURIComponent).join('/');
  const tech = user.audiencePref !== 'BUSINESS_ANALYST';
  const e: any = await guard(() => entity(getCtx(), actor, p.sourceId, p.kind as EntityKind, key, { includeCode: p.kind === 'file' }));
  const sid = p.sourceId;
  return (
    <section className="panel" aria-labelledby="h-ent">
      <p><Link href="/explore">← Explore</Link></p>
      <div className="detail-card">
        <p className="kicker">{p.kind}</p>
        <h2 id="h-ent">{e.title}</h2>
        <Freshness banner={e.banner} />

        {p.kind === 'file' && (<>
          <p className="mono">{e.path}</p>
          {e.purpose && <p>{e.purpose}</p>}
          <p className="muted">{e.fileKind} · layer {e.layer ?? '–'} · {e.loc} lines{e.metrics ? ` · changed in ${e.metrics.churn} commit(s) · fan-in ${e.metrics.fanIn} · ${e.metrics.directTests} direct test(s)` : ''}</p>
          {tech && e.symbol && <p><b>Methods:</b> {e.symbol.methods.map((m: string) => <code key={m} className="chip">{m}</code>)}</p>}
          <Rels sourceId={sid} title="Depends on" rels={e.dependencies} />
          <Rels sourceId={sid} title="Depended on by" rels={e.dependents} dir="from" />
          <Rels sourceId={sid} title="Direct tests" rels={e.directTests} dir="from" />
          <Rels sourceId={sid} title="Requirements" rels={e.requirements} />
          <Rels sourceId={sid} title="Rules enforced" rels={e.rules} />
          <Rels sourceId={sid} title="Database" rels={e.tables} />
          <Rels sourceId={sid} title="Process steps" rels={e.steps} dir="from" />
          {e.incidents.length > 0 && <p><b>Incidents:</b> {e.incidents.map((i: any) => <Chip key={i.key} sourceId={sid} kind="incident" k={i.key} cls="inc" />)}</p>}
          <div className="fact"><h4>History</h4><ul>{e.history.map((c: any) => <li key={c.sha}><Link href={`/explore/${sid}/e/commit/${c.sha}`}><code>{c.short}</code></Link> {fmtDate(c.date)} — {c.subject}{c.ticket ? <> <Chip sourceId={sid} kind="ticket" k={c.ticket} cls="tk" /></> : null}</li>)}</ul></div>
          {e.code != null && (tech ? <><h4>Source code</h4><pre className="src" tabIndex={0}>{e.code}</pre></> : <details><summary>Show source code</summary><pre className="src" tabIndex={0}>{e.code}</pre></details>)}
        </>)}

        {(p.kind === 'requirement' || p.kind === 'rule') && (<>
          {e.requirement && <><p><b>{e.requirement.code}</b> — {e.requirement.title}</p><p style={{ whiteSpace: 'pre-wrap' }}>{e.requirement.body}</p><p className="muted">From {e.requirement.docPath}</p></>}
          {e.ruleCode && <p><b>{e.ruleCode.code}</b> · {e.ruleCode.impl} · {e.ruleCode.trace}</p>}
          <Rels sourceId={sid} title="Implemented / enforced in" rels={e.implementedBy} dir="from" />
          <Rels sourceId={sid} title="Process steps" rels={e.steps} dir="from" />
          {e.incidents.length > 0 && <p><b>Incidents:</b> {e.incidents.map((i: any) => <Chip key={i.key} sourceId={sid} kind="incident" k={i.key} cls="inc" />)}</p>}
          {e.tickets.length > 0 && <p><b>Tickets:</b> {e.tickets.map((t: any) => <Chip key={t.key} sourceId={sid} kind="ticket" k={t.key} cls="tk" />)}</p>}
        </>)}

        {p.kind === 'table' && (<>
          <div className="tbl-wrap"><table><thead><tr><th>Field</th><th>Type</th><th>Added in</th></tr></thead><tbody>{e.table.fields.map((f: any) => <tr key={f.name}><td>{f.name}</td><td>{f.type}</td><td className="mono">{f.addedIn}</td></tr>)}</tbody></table></div>
          <Rels sourceId={sid} title="Used by" rels={e.usedBy} dir="from" />
          <Rels sourceId={sid} title="Entity classes" rels={e.mirroredBy} dir="from" />
          <Rels sourceId={sid} title="Process steps" rels={e.steps} dir="from" />
        </>)}

        {p.kind === 'step' && (<>
          <p>Process: <Link href={processHref(sid, e.process)}>{e.process}</Link></p>
          <Rels sourceId={sid} title="Linked to this step" rels={e.relationships} />
          {e.incidents.length > 0 && <p><b>Incidents:</b> {e.incidents.map((i: any) => <Chip key={i.key} sourceId={sid} kind="incident" k={i.key} cls="inc" />)}</p>}
        </>)}

        {p.kind === 'ticket' && (<>
          <p>{e.ticket.taskmanager && <>Taskmanager {e.ticket.taskmanager} · </>}requirements {e.ticket.reqs.join(', ') || '–'}</p><p>{e.ticket.note}</p>
          {e.commit && <p>Commit <Link href={`/explore/${sid}/e/commit/${e.commit.sha}`}><code>{e.commit.short}</code></Link> {fmtDate(e.commit.date)} {e.commit.branch && <span className="tag">{e.commit.branch}</span>} — {e.commit.subject}</p>}
          {e.commit && <p><b>Files:</b> {e.commit.files.map((f: any) => <RefChip key={f.path} sourceId={sid} refStr={`file:${f.path}`} />)}</p>}
        </>)}

        {p.kind === 'incident' && (<>
          <p><span className="tag">{e.incident.severity}</span> <span className="tag">{e.incident.status}</span></p>
          <p><b>Root cause:</b> {e.incident.rootCause}</p><p>{e.incident.residual}</p>
          {e.incident.fixTicket && <p><b>Fix ticket:</b> <Chip sourceId={sid} kind="ticket" k={e.incident.fixTicket} cls="tk" /></p>}
          <p><b>Files:</b> {e.incident.files.map((f: string) => e.unresolvedFiles.includes(f) ? <span key={f} className="chip" title="Not matched to a source file">{f}</span> : <RefChip key={f} sourceId={sid} refStr={`file:${f}`} />)}</p>
          {e.steps.length > 0 ? <p><b>Affected steps:</b> {e.steps.map((s: any) => <Link key={`${s.process}${s.step}`} className="chip" href={`/explore/${sid}/e/step/${encodeURIComponent(`${s.process}#${s.step}`)}`}>{s.process} {s.step}</Link>)}</p> : <div className="notice">Not linked to any process. If the file names above look right, map them to a process step.</div>}
        </>)}

        {p.kind === 'commit' && (<>
          <p><code>{e.commit.short}</code> · {e.commit.author} · {fmtDateTime(e.commit.date)} {e.commit.branch && <span className="tag">{e.commit.branch}</span>}</p>
          {e.ticket && <p>Ticket <Chip sourceId={sid} kind="ticket" k={e.ticket.key} cls="tk" /></p>}
          <ul>{e.commit.files.map((f: any) => <li key={f.path}><RefChip sourceId={sid} refStr={`file:${f.path}`} /> +{f.additions} −{f.deletions}</li>)}</ul>
        </>)}
      </div>
    </section>
  );
}
