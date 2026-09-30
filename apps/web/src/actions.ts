'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  ServiceError, setPreferences, setRole, addSource, updateSource, enqueueSync, previewImport, runImport, addCustomProcess, removeCustomProcess, createProject, addDocumentVersion,
  startAnalysis, cancelAnalysis, deleteProject, enqueuePackRefine, addManualEdge, removeManualEdge, setSourceToken, type ImportKind, type ColumnMap,
} from '@lens/services';
import type { Audience, Role } from '@prisma/client';
import { getCtx } from '@/lib/ctx';
import { requireActor } from '@/lib/session';
import { signOut } from '@/auth';

export type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

/** Every action re-checks the session, role and source visibility inside the service layer; the UI only hides buttons. */
async function run<T>(fn: (a: Awaited<ReturnType<typeof requireActor>>) => Promise<T>): Promise<Result<{ data: T }>> {
  const who = await requireActor();
  try { return { ok: true, data: await fn(who) }; }
  catch (e) {
    if (e instanceof ServiceError) return { ok: false, error: e.message };
    console.error(JSON.stringify({ level: 'error', msg: 'action failed', error: String((e as Error).message) }));
    return { ok: false, error: 'Something went wrong. Try again.' };
  }
}

export async function setAudience(audience: string) { const { actor } = await requireActor(); await setPreferences(getCtx(), actor, { audience: audience as Audience }); revalidatePath('/', 'layout'); }
export async function setTheme(theme: 'light' | 'dark') {
  const { actor } = await requireActor();
  await setPreferences(getCtx(), actor, { theme });
  (await cookies()).set('lens-theme', theme, { path: '/', sameSite: 'lax', httpOnly: false, maxAge: 60 * 60 * 24 * 365 });
}
export async function signOutAction() { await signOut({ redirectTo: '/signin' }); }

export async function addSourceAction(_p: unknown, f: FormData) {
  return run(async ({ actor }) => {
    const s = await addSource(getCtx(), actor, {
      gitlabProjectId: Number(f.get('projectId')), pathWithNamespace: String(f.get('path') ?? ''), branch: String(f.get('branch') ?? 'main'), vertical: String(f.get('vertical') ?? ''), name: String(f.get('name') ?? ''),
      pathFilters: String(f.get('filters') ?? '').split('\n').map((x) => x.trim()).filter(Boolean), commitRefPattern: String(f.get('pattern') ?? '') || undefined, token: String(f.get('token') ?? '') || undefined,
    });
    revalidatePath('/explore'); return s.id;
  });
}
export async function syncNowAction(sourceId: string, full = false) {
  return run(async ({ actor }) => { const r = await enqueueSync(getCtx(), actor, sourceId, { full }); revalidatePath('/explore'); return r; });
}
export async function setSourceAiAction(sourceId: string, allowed: boolean) { return run(async ({ actor }) => { await updateSource(getCtx(), actor, sourceId, { aiAllowed: allowed }); revalidatePath('/explore'); return allowed; }); }
export async function setSourceTokenAction(sourceId: string, token: string) { return run(async ({ actor }) => { await setSourceToken(getCtx(), actor, sourceId, token || null); return true; }); }

export async function importPreviewAction(sourceId: string, kind: ImportKind, csv: string) { return run(({ actor }) => previewImport(getCtx(), actor, sourceId, kind, csv)); }
export async function importRunAction(sourceId: string, kind: ImportKind, csv: string, mapping: ColumnMap, retain: string[]) {
  return run(async ({ actor }) => { const r = await runImport(getCtx(), actor, sourceId, kind, csv, mapping, { retainColumns: retain }); revalidatePath('/explore'); revalidatePath('/history'); return r; });
}

export async function addProcessAction(_p: unknown, f: FormData) {
  return run(async ({ actor }) => { const p = await addCustomProcess(getCtx(), actor, String(f.get('sourceId')), { name: String(f.get('name') ?? ''), description: String(f.get('description') ?? ''), steps: String(f.get('steps') ?? '') }); revalidatePath('/explore'); return p.id; });
}
export async function removeProcessAction(sourceId: string, id: string) { return run(async ({ actor }) => { await removeCustomProcess(getCtx(), actor, sourceId, id); revalidatePath('/explore'); return true; }); }
export async function addManualEdgeAction(sourceId: string, type: string, fromRef: string, toRef: string, note: string) {
  return run(async ({ actor }) => { await addManualEdge(getCtx(), actor, sourceId, { type: type as never, fromRef, toRef, note }); revalidatePath('/explore'); return true; });
}
export async function removeManualEdgeAction(sourceId: string, id: string) { return run(async ({ actor }) => { await removeManualEdge(getCtx(), actor, sourceId, id); revalidatePath('/explore'); return true; }); }

export async function createProjectAction(_p: unknown, f: FormData): Promise<Result<{ data: string }> | never> {
  const res = await run(async ({ actor }) => {
    const files = await Promise.all(f.getAll('files').filter((x): x is File => x instanceof File && x.size > 0).map(async (x) => ({ name: x.name, bytes: new Uint8Array(await x.arrayBuffer()) })));
    const p = await createProject(getCtx(), actor, { name: String(f.get('name') ?? ''), description: String(f.get('description') ?? ''), files, sourceId: String(f.get('sourceId') ?? '') || undefined });
    return p.id;
  });
  if (res.ok) redirect(`/projects/${res.data}`);
  return res;
}
export async function startAnalysisAction(projectId: string) {
  const res = await run(({ actor }) => startAnalysis(getCtx(), actor, projectId));
  revalidatePath(`/projects/${projectId}`); revalidatePath('/projects');
  return res;
}
export async function cancelAnalysisAction(analysisId: string) { return run(({ actor }) => cancelAnalysis(getCtx(), actor, analysisId)); }
export async function addDocumentAction(_p: unknown, f: FormData) {
  return run(async ({ actor }) => {
    const x = f.get('file'); if (!(x instanceof File) || !x.size) throw new ServiceError('BAD_REQUEST', 'Choose a file.');
    const d = await addDocumentVersion(getCtx(), actor, String(f.get('projectId')), { name: x.name, bytes: new Uint8Array(await x.arrayBuffer()) });
    revalidatePath(`/projects/${f.get('projectId')}`); return d.version;
  });
}
export async function deleteProjectAction(projectId: string) { const r = await run(({ actor }) => deleteProject(getCtx(), actor, projectId)); if (r.ok) redirect('/projects'); return r; }
export async function refinePackAction(sourceId: string, processName: string) { return run(({ actor }) => enqueuePackRefine(getCtx(), actor, sourceId, processName)); }
export async function setRoleAction(userId: string, role: string) { return run(async ({ actor }) => { await setRole(getCtx(), actor, userId, role as Role); revalidatePath('/admin/users'); return true; }); }
