/**
 * State-changing route handlers verify that the request originated from this site (plan §22.3). Server actions get the
 * same check from Next.js itself; SameSite=Lax cookies are the second layer.
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try { return new URL(origin).host === host; } catch { return false; }
}
export const forbiddenJson = (msg = 'Cross-site request refused') => Response.json({ error: msg }, { status: 403 });
