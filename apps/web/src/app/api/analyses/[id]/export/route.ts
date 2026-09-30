import { ServiceError, exportAnalysis, type ExportKind } from '@lens/services';
import { getCtx } from '@/lib/ctx';
import { currentUser } from '@/lib/session';
import { BREAK_GLASS_EMAIL } from '@lens/services';

export const dynamic = 'force-dynamic';
const KINDS: ExportKind[] = ['markdown', 'jira-csv', 'tests'];

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401 });
  const kind = new URL(req.url).searchParams.get('kind') as ExportKind;
  if (!KINDS.includes(kind)) return Response.json({ error: 'Unknown export' }, { status: 400 });
  try {
    const f = await exportAnalysis(getCtx(), { id: user.id, role: user.role, breakGlass: user.email === BREAK_GLASS_EMAIL }, (await params).id, kind);
    return new Response(f.body, { headers: { 'Content-Type': f.mime, 'Content-Disposition': `attachment; filename="${f.filename.replace(/[^\w.-]/g, '_')}"`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof ServiceError) return Response.json({ error: e.message }, { status: e.code === 'NOT_FOUND' ? 404 : e.code === 'FORBIDDEN' ? 403 : 400 });
    throw e;
  }
}
