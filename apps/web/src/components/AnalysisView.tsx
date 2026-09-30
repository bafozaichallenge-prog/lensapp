import Link from 'next/link';
import type { analysisView } from '@lens/services';
import { Chip, Notice, Origin, ProcessRail, Section, fmtDateTime, entityHref, type EntityKind } from './ui';
import { AnalyseButton } from './Forms';

type View = Awaited<ReturnType<typeof analysisView>>;
const PLAN_KEYS = ['business', 'developer', 'qa', 'architect'] as const;
const PLAN_LABEL: Record<(typeof PLAN_KEYS)[number], string> = { business: 'Business analyst', developer: 'Developer', qa: 'QA', architect: 'Architect' };
const AUD_TO_PLAN: Record<string, (typeof PLAN_KEYS)[number]> = { BUSINESS_ANALYST: 'business', DEVELOPER: 'developer', QA: 'qa', ARCHITECT: 'architect' };

function Ev({ v, sourceId, items }: { v: View; sourceId: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="ev evidence" aria-label="Evidence">
      {items.map((e, i) => {
        const r = v.refs[e];
        return r ? <Chip key={i} sourceId={sourceId} kind={r.kind as EntityKind} k={r.key} label={r.kind === 'file' ? r.key.split('/').pop() : r.key} /> : <span key={i} className="chip" title="Not found in this snapshot">{e}</span>;
      })}
    </div>
  );
}

/** One analysis, bound to the snapshot it was produced from (plan §16.2). Section order follows the prototype. */
export function AnalysisView({ v, sourceId, audience, plan, projectId, canAnalyse, canDownload }: { v: View; sourceId: string; audience: string; plan?: string; projectId: string; canAnalyse: boolean; canDownload: boolean }) {
  const tech = audience !== 'BUSINESS_ANALYST';
  const r = v.result;
  const planKey = (PLAN_KEYS as readonly string[]).includes(plan ?? '') ? (plan as (typeof PLAN_KEYS)[number]) : AUD_TO_PLAN[audience] ?? 'business';
  const a = v.analysis;
  return (
    <div className="stack">
      <div className={v.freshness.stale ? 'stale' : 'fresh-ok'} role="status">
        <b>{v.freshness.stale ? 'Source has changed since this analysis.' : 'This analysis matches the current source.'}</b>
        <div style={{ fontSize: '.9rem' }}>
          Source: <b>{v.project.source}</b> · Git SHA <code>{v.freshness.analysisSha.slice(0, 7)}</code> · Synced {fmtDateTime(v.freshness.snapshotSyncedAt)} · Analysis created {fmtDateTime(v.freshness.analysisCreated)}
          {v.freshness.stale && <> · Current SHA <code>{v.freshness.currentSha.slice(0, 7)}</code></>}
        </div>
        {v.freshness.stale && canAnalyse && <div style={{ marginTop: 6 }}><AnalyseButton projectId={projectId} label="Re-run analysis" /></div>}
      </div>
      <p className="muted" style={{ fontSize: '.86rem', margin: 0 }}>
        Version {a.version}{a.model ? ` · ${a.provider}/${a.model} · prompt ${a.promptVersion} · schema v${a.outputSchemaVersion} · ${a.inputTokens} in / ${a.outputTokens} out tokens · ${Math.round((a.durationMs ?? 0) / 100) / 10}s` : ' · deterministic code-graph findings only'}
        {' · '}Source selected: <b>{v.project.sourceSelection}</b>
      </p>
      {a.status === 'FAILED' || a.status === 'CANCELLED' ? <Notice err>{a.error}</Notice> : null}
      {!r && a.status === 'DONE' && (
        <Notice>{a.aiStatus === 'not-configured' ? 'AI analysis is not configured on this server, so only the deterministic code-graph findings are shown.' : a.aiStatus === 'disabled-for-source' ? 'AI analysis is not enabled for this source. An Admin can enable it in the source settings. The deterministic code-graph findings are shown below.' : 'No AI analysis for this version.'}</Notice>
      )}

      {r && (
        <>
          <Section id="r-means" title="What this means">
            <div className="grid2">
              <div className="detail-card"><h3>For the business</h3><p>{r.summary.business}</p></div>
              {tech && <div className="detail-card"><h3>Technical</h3><p>{r.summary.technical}</p></div>}
            </div>
          </Section>

          <Section id="r-processes" title="Affected processes — today vs after" intro={r.processes.length ? undefined : 'No existing process is affected by this change.'}>
            {r.processes.map((p) => {
              const today = p.stages.map((st) => ({ n: st.n, name: `Step ${st.n}` }));
              const model = v.crossCheck.processSteps.find((x) => x.name === p.process);
              void model; void today;
              const stops: { n: number | string; name: string; cls?: 'mod' | 'new' }[] = [];
              const names = p.stages.map((st) => st.n);
              for (const st of p.stages) {
                stops.push({ n: st.n, name: st.note ? st.note.slice(0, 28) : `Step ${st.n}`, cls: st.change === 'modified' ? 'mod' : undefined });
                for (const ns of p.new_stages.filter((x) => x.after === st.n)) stops.push({ n: '+', name: ns.name, cls: 'new' });
              }
              void names;
              return (
                <div className="detail-card" key={p.process}>
                  <h3>{p.process}</h3>
                  <p className="rail-caption">Amber steps change; dashed steps are new.</p>
                  <ProcessRail name={`${p.process} after the change`} steps={stops} />
                  <ul>{p.stages.filter((st) => st.change !== 'none').map((st) => <li key={st.n}>Step {st.n}: {st.note} <Ev v={v} sourceId={sourceId} items={st.evidence} /></li>)}
                    {p.new_stages.map((ns, i) => <li key={`n${i}`}>New step after {ns.after}: <b>{ns.name}</b>. {ns.note} <Ev v={v} sourceId={sourceId} items={ns.evidence} /></li>)}</ul>
                </div>
              );
            })}
          </Section>

          <Section id="r-questions" title="Questions to settle first" intro="Gaps or contradictions in the requirements: not assumptions.">
            <ol>{r.questions.map((q, i) => <li key={i}>{q}</li>)}</ol>
          </Section>

          <Section id="r-risks" title="Risks" intro="Each risk points to evidence in the code graph, history or incidents.">
            {r.risks.map((k, i) => (
              <div className={`risk ${k.severity}`} key={i} style={{ marginBottom: 10 }}>
                <h3><span className="tag">{k.severity}</span> {k.title} <Origin origin="AI_SUGGESTED" reason="Model interpretation of evidence" /></h3>
                <p>{k.why}</p>
                <Ev v={v} sourceId={sourceId} items={k.evidence} />
                {k.mitigation && <p className="muted"><b>Mitigation:</b> {k.mitigation}</p>}
              </div>
            ))}
          </Section>

          <Section id="r-plan" title="Solution plan">
            <div className="plan-tabs" role="tablist" aria-label="Audience">
              {PLAN_KEYS.map((k) => <Link key={k} role="tab" aria-selected={planKey === k} href={`?plan=${k}${v.analysis.id ? `&v=${v.analysis.id}` : ''}#r-plan`} style={{ textDecoration: 'none' }} className={planKey === k ? 'on' : ''}>{PLAN_LABEL[k]}</Link>)}
            </div>
            <ol>{r.plan[planKey].map((st, i) => <li key={i}><b>{st.title}</b>: {st.detail}{tech && st.files?.length ? <Ev v={v} sourceId={sourceId} items={st.files} /> : null}</li>)}</ol>
          </Section>
        </>
      )}

      <Section id="r-changes" title="What changes" intro={r ? undefined : 'Files the code graph matched, and what depends on them.'}>
        {r && (
          <div className="tbl-wrap"><table><thead><tr><th>Where</th><th>Change</th><th>Why</th></tr></thead><tbody>
            {r.impact.map((x, i) => <tr key={i}><td>{v.refs[x.path] ? <Chip sourceId={sourceId} kind="file" k={v.refs[x.path]!.key} label={x.path.split('/').pop()} /> : <code>{x.path}</code>} {x.change === 'new' && <span className="tag">new file</span>}</td><td>{x.change}</td><td>{x.reason}</td></tr>)}
          </tbody></table></div>
        )}
        {r && r.tables.filter((t) => t.change !== 'none').length > 0 && (
          <div className="detail-card"><h3>Data changes</h3><ul>{r.tables.filter((t) => t.change !== 'none').map((t, i) => <li key={i}><Chip sourceId={sourceId} kind="table" k={t.table} /> {t.change}: {t.detail}</li>)}</ul></div>
        )}
        <div className="detail-card" id="graph-cross-check">
          <h3>Code-graph cross-check <Origin origin="INFERRED" reason="Deterministic keyword match against file names, methods and headers" /></h3>
          <p className="evidence">Found by deterministic matching, without AI. Anything the plan left out is highlighted.</p>
          <p><b>Directly matched:</b> {v.crossCheck.matched.length ? v.crossCheck.matched.map((p) => <Chip key={p} sourceId={sourceId} kind="file" k={p} />) : 'nothing matched'}</p>
          {v.crossCheck.processSteps.length > 0 && <p><b>Process steps:</b> {v.crossCheck.processSteps.map((x) => <span key={x.name} className="chip">{x.name}: {x.steps.join(', ')}</span>)}</p>}
          <p><b>Dependents:</b> {v.crossCheck.dependents.length ? v.crossCheck.dependents.map((p) => <Chip key={p} sourceId={sourceId} kind="file" k={p} />) : 'none'}</p>
          <p><b>Existing tests:</b> {v.crossCheck.tests.length ? v.crossCheck.tests.map((p) => <Chip key={p} sourceId={sourceId} kind="file" k={p} />) : 'none found'}</p>
          <p><b>Related rules:</b> {v.crossCheck.rules.length ? v.crossCheck.rules.map((p) => <Chip key={p} sourceId={sourceId} kind="rule" k={p} />) : 'none'}</p>
          <p><b>Past incidents here:</b> {v.crossCheck.incidents.length ? v.crossCheck.incidents.map((p) => <Chip key={p} sourceId={sourceId} kind="incident" k={p} cls="inc" />) : 'none'}</p>
          <p><b>Related tickets:</b> {v.crossCheck.tickets.length ? v.crossCheck.tickets.map((p) => <Chip key={p} sourceId={sourceId} kind="ticket" k={p} cls="tk" />) : 'none'}</p>
          {r && (v.crossCheck.omitted.matched.length > 0 || v.crossCheck.omitted.dependents.length > 0) && (
            <div className="stale"><b>Found in the graph but not in the plan:</b> {[...v.crossCheck.omitted.matched, ...v.crossCheck.omitted.dependents].map((p) => <Chip key={p} sourceId={sourceId} kind="file" k={p} />)}</div>
          )}
        </div>
        {v.grounding && (v.grounding as { dropped?: unknown[] }).dropped?.length ? (
          <Notice err>Lens removed {(v.grounding as { dropped: unknown[] }).dropped.length} AI finding(s) that could not be matched to the repository (for example an invented file path).</Notice>
        ) : null}
      </Section>

      {r && r.tests.length > 0 && (
        <Section id="r-tests" title="Generated tests">
          {tech ? r.tests.map((t, i) => <div className="test" key={i}><h3>{t.name} <span className="muted">({t.file}, {t.kind})</span></h3><p>{t.purpose}</p><pre className="code" tabIndex={0}>{t.code}</pre></div>)
            : <p className="muted">{r.tests.length} ABLUnit tests were generated. Switch to Developer or QA to see the code.</p>}
        </Section>
      )}

      {r && r.tasks.length > 0 && (
        <Section id="r-tasks" title="Tasks to log" intro={`${r.tasks.length} tasks to create before work starts. Put the task number in every commit message so Lens can link the work back to this project.`}>
          <div className="tbl-wrap"><table><thead><tr><th>#</th><th>Log in</th><th>Type</th><th>Task</th><th>Owner</th><th>Depends on</th></tr></thead><tbody>
            {r.tasks.map((t) => (
              <tr key={t.id}><td className="mono">{t.id}</td><td><span className="tag">{t.system}</span></td><td>{t.type}</td>
                <td style={{ minWidth: 280 }}><details><summary style={{ cursor: 'pointer', fontWeight: 600 }}>{t.title}</summary>
                  {t.description && <p>{t.description}</p>}
                  {t.acceptance.length > 0 && <div><b style={{ fontSize: '.88rem' }}>Done when</b><ul>{t.acceptance.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
                  {tech && t.files.length > 0 && <Ev v={v} sourceId={sourceId} items={t.files} />}
                  {t.step && <p className="muted" style={{ fontSize: '.86rem' }}>Process step: {t.step}</p>}</details></td>
                <td>{t.owner}</td><td className="mono">{t.depends_on.join(', ') || '–'}</td></tr>
            ))}
          </tbody></table></div>
        </Section>
      )}

      {canDownload && (
        <div className="row downloads">
          <a className="btn ghost small" href={`/api/analyses/${a.id}/export?kind=markdown`}>Download plan (Markdown)</a>
          {r && r.tasks.length > 0 && <a className="btn ghost small" href={`/api/analyses/${a.id}/export?kind=jira-csv`}>Download for Jira import (CSV)</a>}
          {r && r.tests.length > 0 && <a className="btn ghost small" href={`/api/analyses/${a.id}/export?kind=tests`}>Download tests (.cls snippets)</a>}
        </div>
      )}
    </div>
  );
}
export { entityHref };
