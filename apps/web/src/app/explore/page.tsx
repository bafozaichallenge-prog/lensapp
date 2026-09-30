import Link from 'next/link';
import { can } from '@lens/core';
import { listSources, listSyncRuns, overview, search } from '@lens/services';
import { getCtx } from '@/lib/ctx';
import { guard, requireActor } from '@/lib/session';
import { fmtDateTime, entityHref, processHref, type EntityKind } from '@/components/ui';
import { SyncControl } from '@/components/SyncControl';
import { AddProcessForm, AddSourceForm, AiToggle } from '@/components/Forms';
import { ImportWizard } from '@/components/ImportWizard';

const KIND_LABEL: Record<string, string> = { file: 'Classes and files', requirement: 'Requirements', rule: 'Rules', table: 'Tables', ticket: 'Tickets', incident: 'Incidents', commit: 'Commits', step: 'Steps' };
const INFLIGHT = ['QUEUED', 'FETCHING_CODE', 'FETCHING_HISTORY', 'PARSING', 'LINKING', 'SNAPSHOTTING'];

export default async function Explore({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { actor } = await requireActor();
  const { q } = await searchParams;
  const ctx = getCtx();
  const role = { role: actor.role, canSeeSource: true };
  const [ov, sources, results] = await Promise.all([guard(() => overview(ctx, actor)), listSources(ctx, actor), q ? search(ctx, actor, q) : Promise.resolve([])]);
  const canSync = can('source.sync', role), canManage = can('source.manage', role), canImport = can('import.run', role), canProcess = can('process.manage', role);
  const runs = Object.fromEntries(await Promise.all(sources.map(async (s) => [s.id, (await listSyncRuns(ctx, actor, s.id, 5))] as const)));
  const grouped = new Map<string, typeof results>();
  for (const r of results) grouped.set(r.kind, [...(grouped.get(r.kind) ?? []), r]);
  return (
    <section className="panel" aria-labelledby="h-explore">
      <h2 id="h-explore">Explore the system</h2>
      <form method="get" role="search" className="row" aria-label="Search the system">
        <div className="field-row" style={{ flex: 1 }}><label htmlFor="q">Search classes, requirements, rules, tables, tickets, incidents and commits</label><input id="q" name="q" defaultValue={q ?? ''} type="search" /></div>
        <button className="btn small" type="submit">Search</button>
      </form>
      {q && (
        <div className="stack" aria-live="polite">
          <h3>{results.length} result{results.length === 1 ? '' : 's'} for “{q}”</h3>
          {[...grouped].map(([kind, rs]) => (
            <div key={kind} className="detail-card"><h4>{KIND_LABEL[kind] ?? kind}</h4>
              <ul>{rs.map((r) => <li key={`${r.sourceId}${r.key}`}><Link href={entityHref(r.sourceId, r.kind as EntityKind, r.key)}>{r.title}</Link> <span className="muted">· {r.detail} · {r.source}</span></li>)}</ul></div>
          ))}
        </div>
      )}

      {ov.verticals.length === 0 && <div className="notice">Nothing to explore yet. {canManage ? 'Add a system source below, then sync it.' : 'Ask a Maintainer to add and sync a source.'}</div>}
      {ov.verticals.map((v) => (
        <div key={v.vertical} className="grp">
          <h3>{v.vertical}</h3>
          <div className="tbl-wrap"><table><thead><tr><th>Process</th><th>Source</th><th>Steps</th><th>Changes</th><th>Incidents</th><th>Open</th><th>Last activity</th></tr></thead><tbody>
            {v.processes.map((p) => (
              <tr key={`${p.sourceId}${p.name}`}><td><Link href={processHref(p.sourceId, p.name)}>{p.name}</Link></td><td>{p.source}</td><td>{p.steps}</td><td>{p.changes}</td><td>{p.incidents}</td><td>{p.openIncidents}</td><td>{p.lastActivity ? fmtDateTime(p.lastActivity) : '–'}</td></tr>
            ))}
          </tbody></table></div>
        </div>
      ))}

      <h3 id="sources">System sources</h3>
      <div className="stack">
        {sources.map((s) => {
          const running = runs[s.id]?.find((r) => INFLIGHT.includes(r.status))?.id ?? null;
          return (
            <article key={s.id} className="detail-card">
              <h4>{s.name} <span className="tag">{s.vertical}</span></h4>
              <p className="muted" style={{ margin: 0 }}>{s.pathWithNamespace} · {s.branch} · {s.snapshot ? <>SHA <code>{s.snapshot.sha.slice(0, 7)}</code> · synced {fmtDateTime(s.snapshot.activatedAt)} · {s.snapshot.counts.files} files, {s.snapshot.counts.symbols} classes, {s.snapshot.counts.edges} relationships</> : 'not synced yet'} · status {s.status.toLowerCase()}</p>
              <SyncControl sourceId={s.id} canSync={canSync} running={running} />
              {actor.role === 'ADMIN' && <p><AiToggle sourceId={s.id} allowed={s.aiAllowed} /></p>}
              {runs[s.id] && runs[s.id]!.length > 0 && (
                <details><summary>Sync history</summary>
                  <ul>{runs[s.id]!.map((r) => <li key={r.id}>{fmtDateTime(r.startedAt)} · {r.status.toLowerCase()}{r.mode ? ` (${r.mode})` : ''}{r.toSha ? ` · ${r.toSha.slice(0, 7)}` : ''}{r.status === 'FAILED' && r.log ? ` · ${r.log}` : ''}</li>)}</ul></details>
              )}
              {canImport && <details><summary>Import tickets or incidents (CSV)</summary><ImportWizard sourceId={s.id} isAdmin={actor.role === 'ADMIN'} /></details>}
            </article>
          );
        })}
      </div>
      {canProcess && sources.length > 0 && <details className="detail-card"><summary><b>Add a process</b></summary><AddProcessForm sources={sources.map((s) => ({ id: s.id, name: s.name }))} /></details>}
      {canManage && <details className="detail-card"><summary><b>Add system source</b></summary><AddSourceForm /></details>}
    </section>
  );
}
