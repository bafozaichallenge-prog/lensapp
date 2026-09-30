'use client';
import { useState, useTransition } from 'react';
import { importPreviewAction, importRunAction } from '@/actions';

type Preview = { headers: string[]; mapping: Record<string, string>; missingRequired: string[]; personalData: { column: string; reason: string }[]; sample: Record<string, string>[]; rows: number };
type Report = { created: number; updated: number; skipped: number; droppedColumns: string[]; retainedColumns: string[]; unresolvedPaths: { incident: string; path: string }[]; ambiguousPaths: { incident: string; path: string; candidates: string[] }[] };

const FIELDS: Record<string, { field: string; required: boolean }[]> = {
  tickets: [['key', true], ['title', true], ['taskmanager', false], ['type', false], ['status', false], ['note', false], ['reqs', false], ['commit', false]].map(([field, required]) => ({ field: field as string, required: required as boolean })),
  incidents: [['key', true], ['title', true], ['files', true], ['severity', false], ['date', false], ['symptom', false], ['rootCause', false], ['reqs', false], ['fixTicket', false], ['status', false], ['residual', false]].map(([field, required]) => ({ field: field as string, required: required as boolean })),
};

/** Two-step CSV import: choose columns (remembered per source and kind), see personal-data columns, run, then review unresolved paths. */
export function ImportWizard({ sourceId, isAdmin }: { sourceId: string; isAdmin: boolean }) {
  const [kind, setKind] = useState<'tickets' | 'incidents'>('incidents');
  const [csv, setCsv] = useState('');
  const [pv, setPv] = useState<Preview | null>(null);
  const [map, setMap] = useState<Record<string, string>>({});
  const [retain, setRetain] = useState<string[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  return (
    <div className="stack">
      <div className="field-row"><label htmlFor="imp-kind">What are you importing?</label>
        <select id="imp-kind" value={kind} onChange={(e) => { setKind(e.target.value as never); setPv(null); setReport(null); }}><option value="incidents">Incidents</option><option value="tickets">Tickets</option></select></div>
      <div className="field-row"><label htmlFor="imp-file">CSV file</label>
        <input id="imp-file" type="file" accept=".csv,text/csv" onChange={async (e) => {
          const f = e.target.files?.[0]; setPv(null); setReport(null); setError('');
          if (!f) return; const text = await f.text(); setCsv(text);
          start(async () => { const r = await importPreviewAction(sourceId, kind, text); if (!r.ok) setError(r.error); else { setPv(r.data as Preview); setMap((r.data as Preview).mapping); setRetain([]); } });
        }} /></div>
      {error && <div className="notice err" role="alert">{error}</div>}
      {pv && !report && (
        <div className="stack">
          <p className="muted" style={{ margin: 0 }}>{pv.rows} rows. Match each field to a column; the choice is remembered for next time.</p>
          <div className="grid2">
            {FIELDS[kind]!.map((f) => (
              <div className="field-row" key={f.field}><label htmlFor={`m-${f.field}`}>{f.field}{f.required ? ' *' : ''}</label>
                <select id={`m-${f.field}`} value={map[f.field] ?? ''} onChange={(e) => setMap((m) => { const n = { ...m }; if (e.target.value) n[f.field] = e.target.value; else delete n[f.field]; return n; })}>
                  <option value="">(not imported)</option>{pv.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select></div>
            ))}
          </div>
          {pv.personalData.length > 0 && (
            <div className="notice err" role="alert">
              <b>These columns look like personal data and will be dropped:</b> {pv.personalData.map((p) => `${p.column} (${p.reason})`).join(', ')}.
              {isAdmin ? <div style={{ marginTop: 6 }}>{pv.personalData.map((p) => <label key={p.column} style={{ display: 'block' }}><input type="checkbox" checked={retain.includes(p.column)} onChange={(e) => setRetain((r) => e.target.checked ? [...r, p.column] : r.filter((x) => x !== p.column))} /> Keep “{p.column}” (Admin override)</label>)}</div> : <div>Only an Admin can keep them.</div>}
            </div>
          )}
          <button className="btn" type="button" disabled={pending} onClick={() => start(async () => { setError(''); const r = await importRunAction(sourceId, kind, csv, map, retain); if (!r.ok) setError(r.error); else setReport(r.data as Report); })}>Import</button>
        </div>
      )}
      {report && (
        <div className="stack" role="status">
          <div className="notice">Imported: {report.created} new, {report.updated} updated{report.skipped ? `, ${report.skipped} skipped` : ''}.{report.droppedColumns.length ? ` Dropped columns: ${report.droppedColumns.join(', ')}.` : ''}</div>
          {(report.unresolvedPaths.length > 0 || report.ambiguousPaths.length > 0) && (
            <div className="notice err">
              <b>Some file names could not be matched to source paths.</b> Fix the file names in the CSV and import again, or map them to steps later.
              <ul>{report.unresolvedPaths.map((u, i) => <li key={i}><code>{u.incident}</code>: <code>{u.path}</code> not found</li>)}{report.ambiguousPaths.map((u, i) => <li key={`a${i}`}><code>{u.incident}</code>: <code>{u.path}</code> matches {u.candidates.length} files</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
