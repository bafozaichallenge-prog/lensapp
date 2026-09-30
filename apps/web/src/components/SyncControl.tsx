'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { syncNowAction } from '@/actions';

/** "Sync now" with live progress over SSE. A second click while a run is in flight joins that run. */
export function SyncControl({ sourceId, canSync, running }: { sourceId: string; canSync: boolean; running?: string | null }) {
  const [runId, setRunId] = useState<string | null>(running ?? null);
  const [lines, setLines] = useState<string[]>([]);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  const es = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!runId) return;
    const src = new EventSource(`/api/events/sync/${runId}`);
    es.current = src;
    src.addEventListener('progress', (e) => {
      const p = JSON.parse((e as MessageEvent).data) as { status: string; messages: { message: string }[] };
      setStatus(p.status.toLowerCase().replace(/_/g, ' '));
      if (p.messages.length) setLines((l) => [...l, ...p.messages.map((m) => m.message)].slice(-6));
    });
    src.addEventListener('done', () => { src.close(); setRunId(null); router.refresh(); });
    src.addEventListener('error', () => { src.close(); });
    return () => src.close();
  }, [runId, router]);

  if (!canSync) return null;
  return (
    <div className="stack">
      <div className="row">
        <button className="btn small" type="button" disabled={pending || !!runId}
          onClick={() => start(async () => { setError(''); const r = await syncNowAction(sourceId); if (!r.ok) setError(r.error); else { setLines([]); setRunId(r.data.runId); } })}>
          {runId ? 'Syncing…' : 'Sync now'}
        </button>
        <button className="btn ghost small" type="button" disabled={pending || !!runId} title="Re-download the whole repository"
          onClick={() => start(async () => { setError(''); const r = await syncNowAction(sourceId, true); if (!r.ok) setError(r.error); else setRunId(r.data.runId); })}>Full re-sync</button>
      </div>
      <div aria-live="polite" role="status">
        {runId && <p className="muted" style={{ margin: 0, fontSize: '.88rem' }}>Status: <b>{status || 'queued'}</b></p>}
        {lines.length > 0 && <ul className="log">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
        {error && <div className="notice err" role="alert">{error}</div>}
      </div>
    </div>
  );
}
