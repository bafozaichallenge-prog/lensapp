'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cancelAnalysisAction } from '@/actions';

/** Live analysis progress over SSE with a Stop button (plan §15.8). */
export function ProgressLog({ analysisId }: { analysisId: string }) {
  const [lines, setLines] = useState<string[]>([]);
  const [status, setStatus] = useState('queued');
  const [pending, start] = useTransition();
  const router = useRouter();
  useEffect(() => {
    const src = new EventSource(`/api/events/analysis/${analysisId}`);
    src.addEventListener('progress', (e) => {
      const p = JSON.parse((e as MessageEvent).data) as { status: string; messages: { message: string }[] };
      setStatus(p.status.toLowerCase());
      if (p.messages.length) setLines((l) => [...l, ...p.messages.map((m) => m.message)]);
    });
    src.addEventListener('done', () => { src.close(); router.refresh(); });
    src.addEventListener('error', () => src.close());
    return () => src.close();
  }, [analysisId, router]);
  return (
    <div className="progress" role="status" aria-live="polite">
      <h3><span className="pulse" aria-hidden="true" /> <span>Analysing ({status})</span></h3>
      <p className="muted" style={{ fontSize: '.9rem', margin: '6px 0 0' }}>Claude is reading the source and the requirement documents. This usually takes one to two minutes.</p>
      <ul className="log">{lines.map((l, i) => <li key={i}><b>{l}</b></li>)}</ul>
      <button className="btn ghost small" type="button" disabled={pending} style={{ marginTop: 8 }} onClick={() => start(async () => { await cancelAnalysisAction(analysisId); router.refresh(); })}>Stop</button>
    </div>
  );
}
