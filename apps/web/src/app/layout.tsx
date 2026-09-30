import type { Metadata } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { currentUser, themeFromCookie } from '@/lib/session';
import { Tabs } from '@/components/Tabs';
import { AudienceSwitch, ThemeToggle } from '@/components/Controls';
import { signOutAction } from '@/actions';
import './globals.css';

export const metadata: Metadata = { title: 'Lens System Guide', description: 'A versioned system knowledge graph and change-impact analysis for OpenEdge codebases.' };
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const user = await currentUser();
  const dark = user ? user.themePref === 'dark' : await themeFromCookie();
  return (
    <html lang="en" className={dark ? 'lens-dark' : undefined} suppressHydrationWarning>
      <head>
        {/* Before sign-in the theme comes from localStorage; it never follows prefers-color-scheme. */}
        {!user && <script nonce={nonce} dangerouslySetInnerHTML={{ __html: "try{if(localStorage.getItem('lens-theme')==='dark')document.documentElement.classList.add('lens-dark')}catch(e){}" }} />}
      </head>
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <header className="top">
          <div className="top-inner">
            <div className="brand-row">
              <div className="brand"><span className="mark" aria-hidden="true" /><h1>Lens</h1><span className="apptitle">System Guide</span></div>
              {user && (
                <div className="who">
                  <span>{user.name ?? user.email} · {user.role.toLowerCase()}</span>
                  <form action={signOutAction}><button className="linkbtn" type="submit">Sign out</button></form>
                </div>
              )}
            </div>
          </div>
        </header>
        <nav className="subbar" aria-label="Sections">
          <div className="subbar-inner">
            {user ? <Tabs admin={user.role === 'ADMIN'} /> : <div />}
            <div className="subbar-right">
              {user && <AudienceSwitch value={user.audiencePref} />}
              <ThemeToggle dark={dark} signedIn={!!user} />
            </div>
          </div>
        </nav>
        <main id="main">{children}</main>
        <footer id="foot">
          <p style={{ margin: 0, fontSize: '.86rem' }}>Lens reads code, requirements, tickets and incidents. Do not upload documents that contain real client data.</p>
        </footer>
      </body>
    </html>
  );
}
