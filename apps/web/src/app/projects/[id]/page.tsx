import Link from 'next/link';
import { can } from '@lens/core';
import { analysisView, getProject } from '@lens/services';
import { getCtx } from '@/lib/ctx';
import { guard, requireActor } from '@/lib/session';
import { AnalysisView } from '@/components/AnalysisView';
import { AddDocumentForm, AnalyseButton, DeleteProjectButton } from '@/components/Forms';
import { ProgressLog } from '@/components/ProgressLog';
import { Notice, fmtDate, fmtDateTime } from '@/components/ui';

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string; plan?: string }> }) {
  const { user, actor } = await requireActor();
  const { id } = await params;
  const sp = await searchParams;
  const ctx = getCtx();
  const p = await guard(() => getProject(ctx, actor, id));
  const chosen = p.analyses.find((a) => a.id === sp.v) ?? p.analyses[0];
  const view = chosen ? await guard(() => analysisView(ctx, actor, chosen.id)) : null;
  const running = chosen && ['QUEUED', 'RUNNING'].includes(chosen.status);
  const canAnalyse = can('project.analyse', { role: actor.role, canSeeSource: true });
  return (
    <section className="panel" aria-labelledby="h-proj">
      <div className="proj-head stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 id="h-proj">{p.name} {p.isExample && <span className="tag sample">Example / Seed data</span>}</h2>
          <div className="row">{canAnalyse && !running && <AnalyseButton projectId={p.id} label={chosen ? 'Re-run analysis' : 'Analyse'} />}
            {(p.createdBy === actor.id || actor.role === 'ADMIN') && <DeleteProjectButton projectId={p.id} />}</div>
        </div>
        {p.description && <p className="req">{p.description}</p>}
        <p className="muted" style={{ margin: 0 }}>Created {fmtDate(p.createdAt)} · Source: <b>{p.source}</b> ({p.sourceSelection === 'AUTO' ? 'chosen automatically' : 'chosen by you'})</p>
        {p.documents.length > 0 && <p className="muted" style={{ margin: 0 }}>Documents: {[...new Map(p.documents.map((d) => [d.filename, d])).values()].map((d) => `${d.filename} (v${d.version})`).join(', ')}</p>}
        {canAnalyse && <AddDocumentForm projectId={p.id} />}
        {p.analyses.length > 1 && (
          <nav aria-label="Analysis versions" className="row">
            <span className="muted">Versions:</span>
            {p.analyses.map((a) => <Link key={a.id} className={`chip${chosen?.id === a.id ? ' on' : ''}`} href={`/projects/${p.id}?v=${a.id}`}>v{a.version} · {fmtDateTime(a.createdAt)}{a.status !== 'DONE' ? ` · ${a.status.toLowerCase()}` : ''}</Link>)}
            {chosen && (() => { const older = p.analyses.find((a) => a.version < chosen.version && a.status === 'DONE'); return older && chosen.status === 'DONE' ? <Link className="btn ghost small" href={`/projects/${p.id}/compare?from=${older.id}&to=${chosen.id}`}>Compare v{chosen.version} with v{older.version}</Link> : null; })()}
          </nav>
        )}
      </div>
      {running && chosen && <ProgressLog analysisId={chosen.id} />}
      {!chosen && <Notice>Not analysed yet. Analyse the change to see what it touches.</Notice>}
      {view && !running && (
        <AnalysisView v={view} sourceId={p.sourceId} audience={user.audiencePref} plan={sp.plan} projectId={p.id} canAnalyse={canAnalyse} canDownload={can('download', { role: actor.role, canSeeSource: true })} />
      )}
    </section>
  );
}
