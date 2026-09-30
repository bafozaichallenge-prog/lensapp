'use client';
import { useTransition } from 'react';
import { setAudience, setTheme } from '@/actions';

const AUD: [string, string][] = [['BUSINESS_ANALYST', 'Business analyst'], ['DEVELOPER', 'Developer'], ['QA', 'QA'], ['ARCHITECT', 'Architect']];

export function AudienceSwitch({ value }: { value: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="aud" role="group" aria-labelledby="aud-label">
      <span className="aud-label" id="aud-label">Explain it for</span>
      <div className="seg" aria-busy={pending}>
        {AUD.map(([k, l]) => <button key={k} type="button" aria-pressed={value === k} disabled={pending} onClick={() => start(() => setAudience(k))}>{l}</button>)}
      </div>
    </div>
  );
}

/** Theme is a class on <html>, stored per user (database) and in localStorage before sign-in. It never follows prefers-color-scheme. */
export function ThemeToggle({ dark, signedIn }: { dark: boolean; signedIn: boolean }) {
  const [, start] = useTransition();
  return (
    <button type="button" className="themetog" aria-pressed={dark}
      onClick={() => {
        const next = !document.documentElement.classList.contains('lens-dark');
        document.documentElement.classList.toggle('lens-dark', next);
        try { localStorage.setItem('lens-theme', next ? 'dark' : 'light'); } catch { /* private mode */ }
        document.querySelectorAll<HTMLButtonElement>('.themetog').forEach((b) => b.setAttribute('aria-pressed', String(next)));
        if (signedIn) start(() => setTheme(next ? 'dark' : 'light'));
      }}>
      <span className="ti" aria-hidden="true">{dark ? '☀' : '☾'}</span><span className="tl">{dark ? 'Light mode' : 'Dark mode'}</span>
    </button>
  );
}
