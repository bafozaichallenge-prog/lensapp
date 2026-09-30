'use client';
import { useEffect, useRef, useState } from 'react';
import { refinePackAction } from '@/actions';

const TABS = [
  ['doc', 'Explainer doc', 'A readable write-up of every step: screens, rules, data, code and history.'],
  ['explainer', 'Animated explainer', 'Plays the journey on a phone, step by step, with the rules and data it carries.'],
  ['prototype', 'Interactive prototype', 'Click through the process yourself. Rules, validation and role checks behave as the code does.'],
  ['config', 'Sandbox config', 'Everything the sandbox needs to stand this process up: source, schema, seed data, roles, fixtures and tests.'],
] as const;
type Tab = (typeof TABS)[number][0];

/**
 * Process pack tiles and the full-screen viewer. Generated HTML is shown in an iframe with sandbox="allow-scripts" only
 * (no same-origin), loaded from a route that sets its own sandboxing policy. Escape closes the viewer.
 */
export function PackViewer({ sourceId, processName, dark, canRefine, config, refined }: { sourceId: string; processName: string; dark: boolean; canRefine: boolean; config: { yaml: string; json: string }; refined: boolean }) {
  const [tab, setTab] = useState<Tab | null>(null);
  const [fmt, setFmt] = useState<'yaml' | 'json'>('yaml');
  const [msg, setMsg] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const q = (kind: string) => `sourceId=${encodeURIComponent(sourceId)}&process=${encodeURIComponent(processName)}&kind=${kind}&theme=${dark ? 'dark' : 'light'}`;

  useEffect(() => {
    if (!tab) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setTab(null); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; opener.current?.focus(); };
  }, [tab]);

  return (
    <div className="subsec">
      <h3>Process pack</h3>
      <p className="muted" style={{ fontSize: '.92rem', marginTop: -4 }}>{refined ? 'Wording refined with Claude. ' : ''}Generated from the code graph; regenerated whenever the source is re-synced.</p>
      <div className="pack-grid">
        {TABS.map(([k, l, d]) => (
          <button key={k} className="pack-tile" type="button" onClick={(e) => { opener.current = e.currentTarget; setTab(k); }}>
            <span className={`pack-ic pack-${k}`} aria-hidden="true" /><b>{l}</b><span>{d}</span>
          </button>
        ))}
      </div>
      {tab && (
        <div className="pack-frame-wrap" role="dialog" aria-modal="true" aria-label={`${processName} process pack`}>
          <div className="pack-frame-shell">
            <div className="pack-head" style={{ padding: '10px 14px' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="pack-tabs" role="tablist" onKeyDown={(e) => {
                  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                  const i = TABS.findIndex((t) => t[0] === tab); setTab(TABS[(i + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length]![0]);
                }}>
                  {TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} tabIndex={tab === k ? 0 : -1} onClick={() => setTab(k)}>{l}</button>)}
                </div>
                <div className="row">
                  {canRefine && tab !== 'config' && <button className="btn ghost small" type="button" onClick={async () => { setMsg('Refining…'); const r = await refinePackAction(sourceId, processName); setMsg(r.ok ? 'Queued. Reload the page in about a minute to see the refined wording.' : r.error); }}>{refined ? 'Refine wording again' : 'Refine wording with Claude'}</button>}
                  {tab === 'config' ? (
                    <a className="btn ghost small" href={`/api/pack?${q(fmt === 'yaml' ? 'config-yaml' : 'config-json')}`}>Download {fmt.toUpperCase()}</a>
                  ) : (
                    <>
                      <a className="btn ghost small" href={`/api/pack?${q(tab)}`}>Download HTML</a>
                      {tab === 'doc' && <a className="btn ghost small" href={`/api/pack?${q('markdown')}`}>Download Markdown</a>}
                    </>
                  )}
                  <button ref={closeRef} className="btn small" type="button" onClick={() => setTab(null)}>Close</button>
                </div>
              </div>
              {msg && <div className="notice" role="status" style={{ marginTop: 6 }}>{msg}</div>}
            </div>
            {tab === 'config' ? (
              <div className="pack-cfg" style={{ overflow: 'auto', padding: 12 }}>
                <div className="plan-tabs" role="group" aria-label="Format">
                  {(['yaml', 'json'] as const).map((f) => <button key={f} type="button" aria-pressed={fmt === f} onClick={() => setFmt(f)}>{f.toUpperCase()}</button>)}
                </div>
                <pre className="code pack-pre" tabIndex={0}>{fmt === 'yaml' ? config.yaml : config.json}</pre>
              </div>
            ) : (
              <iframe title={`${processName}: ${TABS.find((t) => t[0] === tab)![1]}`} sandbox="allow-scripts" src={`/api/pack-frame?${q(tab)}`} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
