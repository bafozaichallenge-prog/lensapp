import { BREAK_GLASS_EMAIL, ServiceError, renderPackArtefact } from '@lens/services';
import { getCtx } from '@/lib/ctx';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Generated pack HTML for the sandboxed viewer iframe. The response carries its own policy: `sandbox allow-scripts`
 * (opaque origin, no same-origin access, no forms/popups/top navigation) and a locked-down content policy, so even opening
 * this URL directly cannot reach the app's cookies or APIs (plan §19).
 */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return new Response('Sign in required', { status: 401 });
  const q = new URL(req.url).searchParams;
  const kind = q.get('kind');
  if (kind !== 'doc' && kind !== 'explainer' && kind !== 'prototype') return new Response('Unknown artefact', { status: 400 });
  try {
    const a = await renderPackArtefact(getCtx(), { id: user.id, role: user.role, breakGlass: user.email === BREAK_GLASS_EMAIL }, q.get('sourceId') ?? '', q.get('process') ?? '', kind, q.get('theme') === 'dark' ? 'dark' : 'light');
    return new Response(a.body, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store',
        'Content-Security-Policy': ["sandbox allow-scripts", "default-src 'none'", "script-src 'unsafe-inline'", "style-src 'unsafe-inline'", "img-src data:", "font-src data:", "connect-src 'none'", "frame-ancestors 'self'", "base-uri 'none'", "form-action 'none'"].join('; '),
      },
    });
  } catch (e) {
    if (e instanceof ServiceError) return new Response(e.message, { status: e.code === 'NOT_FOUND' ? 404 : e.code === 'FORBIDDEN' ? 403 : 400 });
    throw e;
  }
}
