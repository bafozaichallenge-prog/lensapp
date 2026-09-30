import Link from 'next/link';
import { can } from '@lens/core';
import { toYaml } from '@lens/pack';
import { getPack, processDetail } from '@lens/services';
import { getCtx, db } from '@/lib/ctx';
import { guard, requireActor, themeFromCookie } from '@/lib/session';
import { Chip, Freshness, Origin, ProcessRail, RefChip, entityHref, fmtDate, processHref } from '@/components/ui';
import { PackViewer } from '@/components/PackViewer';
import { RemoveProcessButton } from '@/components/Forms';

export default async function ProcessPage({ params }: { params: Promise<{ sourceId: string; name: string }> }) {
  const { user, actor } = await requireActor();
  const { sourceId, name: rawName } = await params;
  const name = decodeURIComponent(rawName);
  const ctx = getCtx();
  const d = await guard(() => processDetail(ctx, actor, sourceId, name));
  const pack = await guard(() => getPack(ctx, actor, sourceId, name));
  const tech = user.audiencePref !== 'BUSINESS_ANALYST';
  const dark = user.themePref === 'dark' || (await themeFromCookie());
  const custom = d.origin === 'MANUAL' ? await db.customProcess.findFirst({ where: { sourceId, name } }) : null;
  const role = { role: actor.role, canSeeSource: true };
  return (
    <section className="panel" aria-labelledby="h-proc">
      <p><Link href="/explore">← Explore</Link></p>
      <h2 id="h-proc">{d.name} {d.origin === 'MANUAL' && <span className="tag">added in Lens</span>}</h2>
      {d.description && <p>{d.description}</p>}
      <Freshness banner={d.banner} />
      <ProcessRail name={d.name} steps={d.steps.map((s) => ({ n: s.n, name: s.name, incidents: s.incidents.length }))} href={(n) => entityHref(sourceId, 'step', `${name}#${n}`)} />
      {custom && can('process.manage', role) && <RemoveProcessButton sourceId={sourceId} id={custom.id} />}

      <div className="tbl-wrap"><table><caption className="sr-only" style={{ position: 'absolute', left: -9999 }}>Steps of {d.name}</caption><thead><tr><th>Step</th><th>Requirement</th><th>Rules</th>{tech && <th>Code</th>}<th>Tables</th><th>Incidents</th></tr></thead><tbody>
        {d.steps.map((s) => {
          const req = s.relationships.find((r) => r.type === 'maps-step-req');
          return (
            <tr key={s.n}>
              <td><Link href={entityHref(sourceId, 'step', `${name}#${s.n}`)}>{s.n}. {s.name}</Link></td>
              <td>{s.requirement ? <><Chip sourceId={sourceId} kind="requirement" k={s.requirement.code} label={s.requirement.code} /> {req && <Origin origin={req.origin} confidence={req.confidence} reason={req.reason} />}</> : '–'}</td>
              <td>{s.rules.map((r) => <Chip key={r} sourceId={sourceId} kind="rule" k={r} />)}</td>
              {tech && <td>{s.files.map((f) => <Chip key={f} sourceId={sourceId} kind="file" k={f} />)}</td>}
              <td>{s.tables.map((t) => <Chip key={t} sourceId={sourceId} kind="table" k={t} />)}</td>
              <td>{s.incidents.map((i) => <Chip key={i} sourceId={sourceId} kind="incident" k={i} cls="inc" />)}</td>
            </tr>
          );
        })}
      </tbody></table></div>

      <PackViewer sourceId={sourceId} processName={name} dark={dark} canRefine={can('pack.refine', role)} refined={pack.refined} config={{ yaml: toYaml(pack.config), json: JSON.stringify(pack.config, null, 2) }} />
      {pack.overrideStale && <div className="notice">A wording refinement exists but the code has changed since, so the deterministic wording is shown. Refine again to update it.</div>}

      <h3>History</h3>
      {d.timeline.length === 0 ? <p className="muted">No commits touched this process.</p> : (
        <ul className="timeline">
          {d.timeline.map((c) => (
            <li key={c.sha}>
              <Link href={entityHref(sourceId, 'commit', c.sha)}><code>{c.short}</code></Link> {fmtDate(c.date)} — {c.subject}{c.branch ? <span className="tag">{c.branch}</span> : null}{c.ticket ? <> <Chip sourceId={sourceId} kind="ticket" k={c.ticket} cls="tk" /></> : null}
              <span className="muted"> · touched step{c.steps.length === 1 ? '' : 's'} {c.steps.join(', ')}</span>
            </li>
          ))}
        </ul>
      )}
      <span hidden>{processHref(sourceId, name)}{d.steps.map((s) => s.files.length && <RefChip key={s.n} sourceId={sourceId} refStr={`file:${s.files[0]}`} />)}</span>
    </section>
  );
}
