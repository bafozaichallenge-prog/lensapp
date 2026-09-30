import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { SESSION_MAX_AGE_SECONDS, upsertOAuthUser } from '@lens/services';
import { db, getCtx } from './lib/ctx';

const baseUrl = (process.env.GITLAB_BASE_URL ?? 'https://gitlab.com').replace(/\/$/, '');
// Production deployments set AUTH_URL to the https URL, which turns on the __Secure- cookie prefix and the Secure flag.
const secure = (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? '').startsWith('https://');
export const SESSION_COOKIE = `${secure ? '__Secure-' : ''}authjs.session-token`;

/**
 * GitLab OIDC sign-in with database sessions (8 hours of inactivity). Scopes: openid profile email read_user, plus
 * read_api so Lens can check, with the user's own token, which projects that user may read (plan §7.4). See DECISIONS.md.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: 'database', maxAge: SESSION_MAX_AGE_SECONDS, updateAge: 15 * 60 },
  trustHost: true,
  pages: { signIn: '/signin' },
  providers: [{
    id: 'gitlab', name: 'GitLab', type: 'oidc', issuer: baseUrl,
    clientId: process.env.GITLAB_CLIENT_ID, clientSecret: process.env.GITLAB_CLIENT_SECRET,
    authorization: { params: { scope: 'openid profile email read_user read_api' } },
    checks: ['pkce', 'state'],
  }],
  cookies: { sessionToken: { name: SESSION_COOKIE, options: { httpOnly: true, sameSite: 'lax', path: '/', secure } } },
  events: {
    // after the adapter has created/linked the user: apply explicit admin bootstrap, record gitlab id, audit the sign-in
    async signIn({ user, account, profile }) {
      if (user?.email) await upsertOAuthUser(getCtx(), { email: user.email, name: user.name, gitlabUserId: account?.providerAccountId ?? (profile as { sub?: string } | undefined)?.sub ?? null });
    },
  },
  callbacks: {
    async session({ session, user }) { if (session.user) (session.user as { id?: string }).id = user.id; return session; },
  },
});
