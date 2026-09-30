'use client';
import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addDocumentAction, addProcessAction, addSourceAction, createProjectAction, deleteProjectAction, removeProcessAction, setRoleAction, setSourceAiAction, startAnalysisAction } from '@/actions';

const msg = (s: { ok: boolean; error?: string } | null) => (s && !s.ok ? <div className="notice err" role="alert">{s.error}</div> : null);

export function NewProjectForm({ sources }: { sources: { id: string; name: string; vertical: string }[] }) {
  const [state, action, pending] = useActionState(createProjectAction, null);
  return (
    <form action={action} className="ask stack" encType="multipart/form-data">
      <div className="field-row"><label htmlFor="np-name">Project name</label><input id="np-name" name="name" required maxLength={120} /></div>
      <div className="field-row"><label htmlFor="np-desc">What should change?</label><textarea id="np-desc" name="description" placeholder="Describe the business change in your own words." /></div>
      <div className="field-row"><label htmlFor="np-files">Requirement documents</label>
        <input id="np-files" name="files" type="file" multiple accept=".docx,.md,.txt,.csv,.json" />
        <span className="muted" style={{ fontSize: '.86rem' }}>.docx, .md, .txt, .csv or .json, up to 10 MB each. <b>PDF is not supported in this version.</b> Do not upload documents that contain real client data.</span></div>
      <div className="field-row"><label htmlFor="np-src">System source</label>
        <select id="np-src" name="sourceId" defaultValue=""><option value="">Pick the best match automatically</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.vertical})</option>)}</select></div>
      {msg(state as never)}
      <button className="btn" type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create project'}</button>
    </form>
  );
}

export function AnalyseButton({ projectId, label = 'Analyse' }: { projectId: string; label?: string }) {
  const [pending, start] = useTransition(); const [err, setErr] = useState(''); const router = useRouter();
  return (
    <span>
      <button className="btn" type="button" disabled={pending} onClick={() => start(async () => { setErr(''); const r = await startAnalysisAction(projectId); if (!r.ok) setErr(r.error); else router.refresh(); })}>{pending ? 'Working…' : label}</button>
      {err && <span className="notice err" role="alert" style={{ marginLeft: 8 }}>{err}</span>}
    </span>
  );
}

export function AddDocumentForm({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState(addDocumentAction, null);
  return (
    <form action={action} className="row" encType="multipart/form-data">
      <input type="hidden" name="projectId" value={projectId} />
      <label htmlFor="ad-file" className="muted">Upload a new version of a document (same file name)</label>
      <input id="ad-file" name="file" type="file" accept=".docx,.md,.txt,.csv,.json" required />
      <button className="btn ghost small" type="submit" disabled={pending}>Upload</button>
      {state?.ok ? <span role="status">Saved as version {(state as { data: number }).data}.</span> : msg(state as never)}
    </form>
  );
}

export function DeleteProjectButton({ projectId }: { projectId: string }) {
  const [pending, start] = useTransition();
  return <button className="btn ghost small" type="button" disabled={pending} onClick={() => { if (confirm('Delete this project and all its analyses?')) start(async () => { await deleteProjectAction(projectId); }); }}>Delete project</button>;
}

export function AddSourceForm() {
  const [state, action, pending] = useActionState(addSourceAction, null);
  return (
    <form action={action} className="stack">
      <div className="grid2">
        <div className="field-row"><label htmlFor="as-name">Display name</label><input id="as-name" name="name" required /></div>
        <div className="field-row"><label htmlFor="as-vert">Vertical</label><input id="as-vert" name="vertical" required placeholder="Personal Insurance" /></div>
        <div className="field-row"><label htmlFor="as-pid">GitLab project ID</label><input id="as-pid" name="projectId" type="number" required /></div>
        <div className="field-row"><label htmlFor="as-path">Project path</label><input id="as-path" name="path" placeholder="group/project" required /></div>
        <div className="field-row"><label htmlFor="as-branch">Branch</label><input id="as-branch" name="branch" defaultValue="main" required /></div>
        <div className="field-row"><label htmlFor="as-token">Access token (read_api, read_repository)</label><input id="as-token" name="token" type="password" autoComplete="off" /></div>
      </div>
      <details><summary>Advanced</summary>
        <div className="field-row"><label htmlFor="as-filters">Path filters (one per line)</label><textarea id="as-filters" name="filters" /></div>
        <div className="field-row"><label htmlFor="as-pat">Commit reference pattern</label><input id="as-pat" name="pattern" placeholder="\b(TSK\d{5,}|[A-Z][A-Z0-9]+-\d+)\b" /></div></details>
      {msg(state as never)}{state?.ok && <div className="notice" role="status">Source added. Use “Sync now” to load it.</div>}
      <button className="btn" type="submit" disabled={pending}>Add system source</button>
    </form>
  );
}

export function AddProcessForm({ sources }: { sources: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(addProcessAction, null);
  return (
    <form action={action} className="stack addform">
      <div className="field-row"><label htmlFor="ap-src">System source</label><select id="ap-src" name="sourceId" required>{sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      <div className="field-row"><label htmlFor="ap-name">Process name</label><input id="ap-name" name="name" required /></div>
      <div className="field-row"><label htmlFor="ap-desc">Purpose</label><input id="ap-desc" name="description" /></div>
      <div className="field-row"><label htmlFor="ap-steps">Steps (one per line, optional “| BR-010” requirement)</label><textarea id="ap-steps" name="steps" required placeholder={'Register claim | BR-010\nAssess claim\nPay out'} /></div>
      {msg(state as never)}{state?.ok && <div className="notice" role="status">Process added. It survives future syncs.</div>}
      <button className="btn" type="submit" disabled={pending}>Add process</button>
    </form>
  );
}

export function RemoveProcessButton({ sourceId, id }: { sourceId: string; id: string }) {
  const [pending, start] = useTransition(); const router = useRouter();
  return <button className="btn ghost small" type="button" disabled={pending} onClick={() => { if (confirm('Remove this custom process?')) start(async () => { await removeProcessAction(sourceId, id); router.push('/explore'); }); }}>Remove process</button>;
}

export function AiToggle({ sourceId, allowed }: { sourceId: string; allowed: boolean }) {
  const [pending, start] = useTransition(); const [err, setErr] = useState(''); const router = useRouter();
  return (
    <span>
      <label><input type="checkbox" defaultChecked={allowed} disabled={pending} onChange={(e) => start(async () => { const r = await setSourceAiAction(sourceId, e.target.checked); if (!r.ok) { setErr(r.error); e.target.checked = allowed; } else router.refresh(); })} /> Allow AI analysis of this source</label>
      {err && <span className="notice err" role="alert"> {err}</span>}
    </span>
  );
}

export function RoleSelect({ userId, role, self }: { userId: string; role: string; self: boolean }) {
  const [pending, start] = useTransition(); const [err, setErr] = useState(''); const router = useRouter();
  return (
    <span>
      <label className="sr-only" htmlFor={`role-${userId}`} style={{ position: 'absolute', left: -9999 }}>Role</label>
      <select id={`role-${userId}`} defaultValue={role} disabled={pending || self} onChange={(e) => start(async () => { const r = await setRoleAction(userId, e.target.value); if (!r.ok) setErr(r.error); else router.refresh(); })}>
        {['VIEWER', 'CONTRIBUTOR', 'MAINTAINER', 'ADMIN'].map((r) => <option key={r} value={r}>{r.toLowerCase()}</option>)}
      </select>{err && <span className="notice err" role="alert"> {err}</span>}
    </span>
  );
}
