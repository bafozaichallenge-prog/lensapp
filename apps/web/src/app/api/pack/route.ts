import { BREAK_GLASS_EMAIL, ServiceError, renderPackArtefact, type PackArtefact } from '@lens/services';
import { getCtx } from '@/lib/ctx';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';
const KINDS = ['doc', 'explainer', 'prototype', 'markdown', 'config-yaml', 'config-json'];

/** Downloads of a process-pack artefact (attachment). Viewing HTML happens through /api/pack-frame. */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const kind = q.get('kind') as PackArtefact;
  if (!KINDS.includes(kind)) return Response.json({ error: 'Unknown artefact' }, { status: 400 });
  try {
    const a = await renderPackArtefact(getCtx(), { id: user.id, role: user.role, breakGlass: user.email === BREAK_GLASS_EMAIL }, q.get('sourceId') ?? '', q.get('process') ?? '', kind, q.get('theme') === 'dark' ? 'dark' : 'light');
    return new Response(a.body, { headers: { 'Content-Type': a.mime, 'Content-Disposition': `attachment; filename="${a.filename.replace(/[^\w.-]/g, '_')}"`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof ServiceError) return Response.json({ error: e.message }, { status: e.code === 'NOT_FOUND' ? 404 : e.code === 'FORBIDDEN' ? 403 : 400 });
    throw e;
  }
}
