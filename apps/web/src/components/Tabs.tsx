'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/projects', label: 'Projects' },
  { href: '/explore', label: 'Explore the system' },
  { href: '/history', label: 'History and incidents' },
];

/** Section tabs. Arrow keys move between tabs (plan §21). */
export function Tabs({ admin }: { admin: boolean }) {
  const path = usePathname();
  const tabs = admin ? [...TABS, { href: '/admin/users', label: 'Users' }] : TABS;
  return (
    <div className="tabs" role="tablist" aria-label="Sections"
      onKeyDown={(e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const links = Array.from(e.currentTarget.querySelectorAll<HTMLAnchorElement>('a[role="tab"]'));
        const i = links.indexOf(document.activeElement as HTMLAnchorElement);
        if (i < 0) return;
        e.preventDefault();
        links[(i + (e.key === 'ArrowRight' ? 1 : -1) + links.length) % links.length]!.focus();
      }}>
      {tabs.map((t) => {
        const on = path === t.href || path.startsWith(t.href + '/');
        return <Link key={t.href} href={t.href} role="tab" aria-selected={on} tabIndex={on ? 0 : -1} style={{ display: 'inline-block', textDecoration: 'none' }}
          className={on ? 'tab on' : 'tab'}>{t.label}</Link>;
      })}
    </div>
  );
}
