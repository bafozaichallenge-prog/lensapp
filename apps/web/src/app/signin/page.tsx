import { redirect } from 'next/navigation';
import { breakGlassEnabled } from '@lens/services';
import { signIn } from '@/auth';
import { currentUser } from '@/lib/session';

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string; bg?: string }> }) {
  if (await currentUser()) redirect('/projects');
  const sp = await searchParams;
  return (
    <div className="panel" style={{ maxWidth: 520 }}>
      <h2>Sign in</h2>
      <p className="muted">Use your company GitLab account. Access to each system follows your GitLab permissions.</p>
      {sp.error && <div className="notice err" role="alert">Sign-in failed. If this keeps happening, ask an Admin to check your GitLab access.</div>}
      <form action={async () => { 'use server'; await signIn('gitlab', { redirectTo: '/projects' }); }}>
        <button className="btn" type="submit">Sign in with GitLab</button>
      </form>
      {breakGlassEnabled(process.env) && (
        <details style={{ marginTop: 24 }}>
          <summary>Local administrator (break-glass)</summary>
          <form method="post" action="/api/breakglass" className="stack" style={{ marginTop: 8 }}>
            <div className="field-row"><label htmlFor="pw">Password</label><input id="pw" name="password" type="password" autoComplete="current-password" required /></div>
            {sp.bg === 'failed' && <div className="notice err" role="alert">That did not work.</div>}
            <button className="btn ghost" type="submit">Sign in</button>
          </form>
        </details>
      )}
    </div>
  );
}
