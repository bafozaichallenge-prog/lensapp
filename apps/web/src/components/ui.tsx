import Link from 'next/link';
import type { ReactNode } from 'react';

export const fmtDate = (d: Date | string | null | undefined) => {
  if (!d) return '';
  const x = new Date(d);
  return isNaN(+x) ? String(d) : x.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
};
export const fmtDateTime = (d: Date | string | null | undefined) => {
  if (!d) return '';
  const x = new Date(d);
  return isNaN(+x) ? String(d) : x.toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const enc = (k: string) => k.split('/').map(encodeURIComponent).join('/');
export type EntityKind = 'file' | 'requirement' | 'rule' | 'table' | 'step' | 'ticket' | 'incident' | 'commit';
export const entityHref = (sourceId: string, kind: EntityKind, key: string) => `/explore/${sourceId}/e/${kind}/${enc(key)}`;
export const processHref = (sourceId: string, name: string) => `/explore/${sourceId}/process/${encodeURIComponent(name)}`;

/** Link to any graph entity. Refs like "file:<path>" are accepted. */
export function Chip({ sourceId, kind, k, label, cls }: { sourceId: string; kind: EntityKind; k: string; label?: string; cls?: string }) {
  return <Link className={`chip ${cls ?? ''}`} href={entityHref(sourceId, kind, k)}>{label ?? k.split('/').pop()}</Link>;
}

const REF_KIND: Record<string, EntityKind> = { file: 'file', req: 'requirement', rule: 'rule', table: 'table', step: 'step' };
export function RefChip({ sourceId, refStr }: { sourceId: string; refStr: string }) {
  const i = refStr.indexOf(':');
  const kind = REF_KIND[refStr.slice(0, i)];
  const key = refStr.slice(i + 1);
  return kind ? <Chip sourceId={sourceId} kind={kind} k={key} label={kind === 'file' ? key.split('/').pop() : key} /> : <span className="chip">{refStr}</span>;
}

/** Where a relationship comes from (plan §3.2/§25): origin, confidence and the reason. Inferred is never shown as confirmed. */
export function Origin({ origin, confidence, reason }: { origin: string; confidence?: number; reason?: string | null }) {
  const label = origin === 'EXPLICIT' ? 'CONFIRMED' : origin === 'AI_SUGGESTED' ? 'AI SUGGESTED' : origin;
  return <span className={`origin ${origin}`} title={reason ?? undefined}>{label}{origin === 'INFERRED' && confidence != null ? ` ${confidence.toFixed(2)}` : ''}</span>;
}

export function Section({ id, title, intro, children }: { id?: string; title: string; intro?: string; children: ReactNode }) {
  return <section className="sec" id={id}><h2>{title}</h2>{intro ? <p className="sec-intro">{intro}</p> : null}{children}</section>;
}
export const Notice = ({ children, err }: { children: ReactNode; err?: boolean }) => <div className={`notice${err ? ' err' : ''}`} role={err ? 'alert' : 'status'}>{children}</div>;

/** Station diagram (plan §17.3): the process as a rail of numbered steps; incident counts show as badges. */
export function ProcessRail({ name, steps, href, selected, today }: { name: string; steps: { n: number | string; name: string; incidents?: number; cls?: 'mod' | 'new' }[]; href?: (n: number) => string; selected?: number; today?: boolean }) {
  const stops = [...steps.map((s) => ({ n: String(s.n), name: s.name, inc: s.incidents ?? 0, sel: selected === s.n, href: href && typeof s.n === 'number' ? href(s.n) : '', end: false, cls: s.cls })), { n: '✓', name: 'Done', inc: 0, sel: false, href: '', end: true, cls: undefined }];
  const x0 = 72, x1 = 928, y = 24;
  const xs = stops.map((_, i) => (stops.length === 1 ? 500 : x0 + ((x1 - x0) * i) / (stops.length - 1)));
  const wrap = (t: string) => { const w = t.split(' '); if (w.length < 2 || t.length < 14) return [t]; let best = 1, bd = 1e9; for (let i = 1; i < w.length; i++) { const d = Math.abs(w.slice(0, i).join(' ').length - w.slice(i).join(' ').length); if (d < bd) { bd = d; best = i; } } return [w.slice(0, best).join(' '), w.slice(best).join(' ')]; };
  return (
    <div className="rail-scroll">
      <svg viewBox="0 0 1000 96" role="group" aria-label={`${name} steps`}>
        <line x1={x0} y1={y} x2={x1} y2={y} className={`rail-line${today ? ' today' : ''}`} />
        {stops.map((s, i) => {
          const body = (
            <g className={`st${today ? ' today' : ''}${s.end ? ' end' : ''}${s.cls ? ' ' + s.cls : ''}${s.href ? ' click' : ''}${s.sel ? ' sel' : ''}`} transform={`translate(${xs[i]},${y})`}>
              <circle r={15} className="ring" /><text className="num" y={4.5}>{s.n}</text>
              {wrap(s.name).map((ln, j) => <text key={j} y={36 + j * 16} textAnchor="middle">{ln}</text>)}
              {s.inc ? <><circle className="badge" cx={13} cy={-14} r={9} /><text className="badge-t" x={13} y={-10.5}>{s.inc}</text></> : null}
            </g>
          );
          return s.href ? <a key={i} href={s.href} aria-label={`Step ${s.n}: ${s.name}${s.inc ? `, ${s.inc} incident${s.inc > 1 ? 's' : ''}` : ''}`}>{body}</a> : <g key={i}>{body}</g>;
        })}
      </svg>
    </div>
  );
}

export function Freshness({ banner, label = 'Source' }: { banner: { name: string; shortSha: string; syncedAt: Date | string | null }; label?: string }) {
  return <p className="muted" style={{ fontSize: '.88rem', margin: '4px 0' }}>{label}: <b>{banner.name}</b> · Git SHA <code>{banner.shortSha}</code> · synced {fmtDateTime(banner.syncedAt)}</p>;
}
