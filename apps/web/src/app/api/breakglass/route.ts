import { NextResponse } from 'next/server';
import { breakGlassLogin } from '@lens/services';
import { getCtx } from '@/lib/ctx';
import { forbiddenJson, sameOrigin } from '@/lib/csrf';
import { SESSION_COOKIE } from '@/auth';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbiddenJson();
  const form = await req.formData().catch(() => null);
  const password = String(form?.get('password') ?? '');
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  const res = await breakGlassLogin(getCtx(), password, ip);
  const base = new URL('/', req.headers.get('origin') ?? req.url);
  if (!res) return NextResponse.redirect(new URL('/signin?bg=failed', base), 303);
  const out = NextResponse.redirect(new URL('/projects', base), 303);
  out.cookies.set(SESSION_COOKIE, res.token, { httpOnly: true, sameSite: 'lax', path: '/', secure: SESSION_COOKIE.startsWith('__Secure-'), expires: res.expires });
  return out;
}
