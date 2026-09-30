import { BREAK_GLASS_EMAIL, ServiceError, analysisProgress } from '@lens/services';
import { getCtx } from '@/lib/ctx';
import { currentUser } from '@/lib/session';
import { sse } from '@/lib/sse';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response('Sign in required', { status: 401 });
  const actor = { id: user.id, role: user.role, breakGlass: user.email === BREAK_GLASS_EMAIL };
  const { id } = await params;
  try { await analysisProgress(getCtx(), actor, id); } catch (e) { if (e instanceof ServiceError) return new Response('Not found', { status: 404 }); throw e; }
  return sse(req.signal, async (after) => { const p = await analysisProgress(getCtx(), actor, id, after); return { finished: p.finished, status: p.status, error: p.error, messages: p.messages }; });
}
