import { db } from '@/lib/ctx';
export const dynamic = 'force-dynamic';

/** Liveness/readiness for the container health check. Reveals nothing beyond up/down. */
export async function GET() {
  try { await db.$queryRaw`SELECT 1`; return Response.json({ ok: true, db: 'up' }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return Response.json({ ok: false, db: 'down' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
