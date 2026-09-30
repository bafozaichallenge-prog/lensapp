import { BREAK_GLASS_EMAIL, ServiceError, runProgress } from '@lens/services';
import { getCtx } from '@/lib/ctx';
import { currentUser } from '@/lib/session';
import { sse } from '@/lib/sse';

export const dynamic = 'force-dynamic';

/** Server-sent events for a sync run: progress messages until it finishes. */
export async function GET(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const user = await currentUser();
  if (!user) return new Response('Sign in required', { status: 401 });
  const actor = { id: user.id, role: user.role, breakGlass: user.email === BREAK_GLASS_EMAIL };
  const { runId } = await params;
  try { if (!(await runProgress(getCtx(), actor, runId))) return new Response('Not found', { status: 404 }); }
  catch (e) { if (e instanceof ServiceError) return new Response('Not found', { status: 404 }); throw e; }
  return sse(req.signal, async (after) => { const p = await runProgress(getCtx(), actor, runId, after); return p ? { finished: p.finished, status: p.status, messages: p.messages } : { finished: true, status: 'GONE', messages: [] }; });
}
