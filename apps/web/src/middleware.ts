import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC = [/^\/signin/, /^\/api\/auth\//, /^\/api\/health/, /^\/api\/breakglass/, /^\/forbidden/];
const SESSION_COOKIES = ['authjs.session-token', '__Secure-authjs.session-token'];

/**
 * Every page and API route needs a session (plan §7.1): this gate rejects requests without a session cookie; each page
 * and route handler then validates the session against the database and checks the role and source visibility again.
 * Also sets a per-request-nonce Content-Security-Policy (plan §22.3).
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const authed = SESSION_COOKIES.some((c) => req.cookies.has(c));
  if (!authed && !PUBLIC.some((re) => re.test(pathname))) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    // relative Location: correct behind any reverse proxy, whatever host the server believes it has
    return new NextResponse(null, { status: 307, headers: { Location: '/signin' } });
  }
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const dev = process.env.NODE_ENV !== 'production';
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self'" + (dev ? " 'unsafe-inline'" : ''),
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self'${dev ? ' ws:' : ''}`,
    "frame-src 'self'",
    "frame-ancestors 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  const headers = new Headers(req.headers);
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set('Content-Security-Policy', csp);
  return res;
}

export const config = {
  // the pack frame sets its own (sandboxing) policy, so it is excluded from the page CSP
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/pack-frame).*)'],
};
