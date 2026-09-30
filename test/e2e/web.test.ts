/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { dbReachable } from '../helpers/services';
import { CHROMIUM, built, startWeb, BREAK_GLASS_PASSWORD, type Web } from './web-harness';

const ready = dbReachable && fs.existsSync(CHROMIUM) && built();
const P = 'NewBusiness/';
const axeSource = fs.readFileSync(path.resolve(__dirname, '../../node_modules/axe-core/axe.min.js'), 'utf8');

describe.skipIf(!ready)('web app in a real browser (built Next.js server, real PostgreSQL)', () => {
  let web: Web; let browser: Browser;
  const ctxs: BrowserContext[] = [];
  const as = async (role: any, opts: Parameters<Browser['newContext']>[0] = {}) => {
    const c = await browser.newContext({ baseURL: web.url, ...opts });
    if (role) await c.addCookies([web.cookie(role)]);
    ctxs.push(c);
    return c.newPage();
  };
  const goto = async (p: Page, url: string) => { const r = await p.goto(url); await p.waitForLoadState('domcontentloaded'); return r; };

  beforeAll(async () => { web = await startWeb(); browser = await chromium.launch({ executablePath: CHROMIUM, args: ['--no-sandbox'] }); }, 120_000);
  afterAll(async () => { for (const c of ctxs) await c.close().catch(() => undefined); await browser?.close(); await web?.stop(); }, 60_000);

  describe('authentication and transport security', () => {
    it('every page needs a session; the health check is public and reveals nothing else', async () => {
      const r = await fetch(`${web.url}/projects`, { redirect: 'manual' });
      expect(r.status).toBe(307); expect(r.headers.get('location')).toContain('/signin');
      expect((await fetch(`${web.url}/api/analyses/x/export?kind=markdown`)).status).toBe(401);
      expect((await fetch(`${web.url}/api/pack?kind=doc`)).status).toBe(401);
      expect((await fetch(`${web.url}/api/events/sync/x`)).status).toBe(401);
      const h = await fetch(`${web.url}/api/health`);
      expect(h.status).toBe(200); expect(await h.json()).toEqual({ ok: true, db: 'up' });
    });
    it('sets a nonce-based CSP, nosniff and frame protections; session cookie is HttpOnly + SameSite=Lax', async () => {
      const r = await fetch(`${web.url}/signin`);
      const csp = r.headers.get('content-security-policy')!;
      expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
      expect(csp).toContain("frame-ancestors 'self'"); expect(csp).toContain("object-src 'none'"); expect(csp).not.toContain("'unsafe-eval'");
      expect(r.headers.get('x-content-type-options')).toBe('nosniff');
      expect(r.headers.get('x-powered-by')).toBeNull();
      const bad = await fetch(`${web.url}/api/breakglass`, { method: 'POST', body: new URLSearchParams({ password: BREAK_GLASS_PASSWORD }) });
      expect(bad.status).toBe(403); // no same-origin Origin header: CSRF refused, even with the right password
    });
    it('shows the GitLab sign-in and (when enabled) break-glass; wrong password fails, right password signs in as Admin', async () => {
      const p = await as(null);
      await goto(p, '/signin');
      await expect(p.getByRole('button', { name: 'Sign in with GitLab' }).isVisible()).resolves.toBe(true);
      await p.locator('summary', { hasText: 'break-glass' }).click();
      await p.fill('#pw', 'wrong'); await p.click('button:has-text("Sign in"):not(:has-text("GitLab"))');
      await p.waitForURL(/bg=failed/);
      await p.locator('summary', { hasText: 'break-glass' }).click();
      await p.fill('#pw', BREAK_GLASS_PASSWORD); await p.click('button:has-text("Sign in"):not(:has-text("GitLab"))');
      await p.waitForURL(/\/projects/);
      expect(await p.locator('.who').innerText()).toMatch(/admin/i);
      const cookie = (await p.context().cookies()).find((c) => c.name === 'authjs.session-token')!;
      expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax' });
      expect(await p.getByRole('tab', { name: 'Users' }).count()).toBe(1);
    });
  });

  describe('role restrictions (server-enforced; the UI only hides buttons)', () => {
    it('a Viewer can read but sees no sync, source, import or process controls', async () => {
      const p = await as('VIEWER'); await goto(p, '/explore');
      expect(await p.getByText('Sync now').count()).toBe(0);
      expect(await p.getByText('Add system source').count()).toBe(0);
      expect(await p.getByText('Import tickets or incidents').count()).toBe(0);
      expect(await p.getByText('New Business Process').first().isVisible()).toBe(true);
      await goto(p, '/projects'); expect(await p.getByRole('link', { name: 'New change' }).count()).toBe(0);
    });
    it('direct navigation to privileged pages is refused', async () => {
      const v = await as('VIEWER');
      await goto(v, '/projects/new'); expect(v.url()).toContain('/forbidden');
      await goto(v, '/admin/users'); expect(v.url()).toContain('/forbidden');
      const c = await as('CONTRIBUTOR'); await goto(c, '/admin/users'); expect(c.url()).toContain('/forbidden');
      expect(await c.getByRole('tab', { name: 'Users' }).count()).toBe(0);
    });
    it('a Maintainer sees Sync now, Add system source and the import wizard; only an Admin sees the AI toggle', async () => {
      const m = await as('MAINTAINER'); await goto(m, '/explore');
      expect(await m.getByRole('button', { name: 'Sync now' }).allInnerTexts()).toEqual(['Sync now']);
      expect(await m.locator('article.detail-card h4').allInnerTexts(), 'sources visible to the maintainer').toHaveLength(1);
      expect(await m.locator('summary', { hasText: 'Add system source' }).count()).toBe(1);
      expect(await m.locator('summary', { hasText: 'Import tickets or incidents' }).count()).toBe(1);
      expect(await m.getByText('Allow AI analysis of this source').count()).toBe(0);
      const a = await as('ADMIN'); await goto(a, '/explore');
      expect(await a.getByText('Allow AI analysis of this source').count()).toBe(1);
    });
    it('a user without GitLab access to the source sees nothing of it and gets 404 on its pages', async () => {
      const o = await as('outsider'); await goto(o, '/explore');
      expect(await o.getByText('New Business Process').count()).toBe(0);
      const r = await goto(o, `/explore/${web.source.id}/process/New%20Business%20Process`); expect(r!.status()).toBe(404);
      const e = await o.request.get(`/api/analyses/${web.aiAnalysisId}/export?kind=markdown`); expect(e.status()).toBe(404);
    });
    it('role changes are Admin-only in the UI and take effect for the user', async () => {
      const a = await as('ADMIN'); await goto(a, '/admin/users');
      const email = (await (await import('../helpers/services')).db!.user.findUnique({ where: { id: web.actors.VIEWER.id } }))!.email;
      const row = a.locator('tr', { has: a.locator(`text=${email}`) }).first();
      await row.locator('select').selectOption('CONTRIBUTOR');
      await a.waitForTimeout(800);
      const v = await as('VIEWER'); await goto(v, '/projects');
      expect(await v.getByRole('link', { name: 'New change' }).count()).toBe(1);
      expect(await a.getByText('user.role_change').first().isVisible()).toBe(true);
      await a.reload(); await a.locator('tr', { has: a.locator(`text=${email}`) }).first().locator('select').selectOption('VIEWER'); await a.waitForTimeout(600);
    });
  });

  describe('Explore', () => {
    it('start at a process, drill to a step, then to a class; see rules, tables, incidents, history and why Lens linked them', async () => {
      const p = await as('VIEWER'); await goto(p, '/explore');
      await p.getByRole('link', { name: 'New Business Process' }).first().click();
      await p.waitForURL(/process/);
      expect(await p.locator('svg[aria-label$="steps"] a').count()).toBe(7); // seven steps; "Done" is not a link
      // Freshness on every source page
      expect(await p.locator('text=Git SHA').first().innerText()).toMatch(/aaaaaaa/);
      await p.getByRole('link', { name: /Step 5: Capture collection details/ }).click();
      await p.waitForURL(/e\/step/);
      const body = await p.locator('main').innerText();
      expect(body).toMatch(/BR-005/); expect(body).toMatch(/NB-COLLECTION-002/); expect(body).toMatch(/INC-2291/);
      expect(body).toMatch(/INFERRED 0\.\d\d/); expect(body).toMatch(/CONFIRMED|INFERRED/);
      await p.getByRole('link', { name: 'CollectionInstruction.cls' }).first().click();
      await p.waitForURL(/e\/file/);
      const cls = await p.locator('main').innerText();
      expect(cls).toMatch(/Depends on/); expect(cls).toMatch(/Depended on by/); expect(cls).toMatch(/Direct tests/); expect(cls).toMatch(/7b94784/); expect(cls).toMatch(/mirrors/);
    });
    it('search returns entity types grouped, and links through', async () => {
      const p = await as('VIEWER'); await goto(p, '/explore?q=collection');
      const txt = await p.locator('main').innerText();
      for (const h of ['Classes and files', 'Requirements', 'Rules', 'Tables']) expect(txt).toContain(h);
      await goto(p, '/explore?q=NBJ-127'); await p.getByRole('link', { name: /NBJ-127/ }).first().click(); await p.waitForURL(/e\/ticket/);
      expect(await p.locator('main').innerText()).toMatch(/7b94784/);
    });
    it('history places INC-2291 on step 5 and lists INC-2318 as not linked to a process', async () => {
      const p = await as('VIEWER'); await goto(p, '/history');
      const txt = await p.locator('main').innerText();
      expect(txt).toContain('INC-2291'); expect(txt).toContain('Not linked to any process'); expect(txt).toContain('INC-2318');
      expect(await p.locator('svg[aria-label$="steps"] .badge').count()).toBeGreaterThan(0);
    });
  });

  describe('imports through the UI', () => {
    it('a Maintainer maps columns, sees personal-data columns dropped, imports, and gets unresolved paths reported', async () => {
      const m = await as('MAINTAINER'); await goto(m, '/explore');
      await m.locator('summary', { hasText: 'Import tickets or incidents' }).click();
      const csv = 'id,title,files,reporter email,notes\nINC-8001,UI import,src/Nope.cls;src/domain/entities/Contract.cls,jane@corp.co,call 082 123 4567\nINC-8002,Second,src/Bootstrap.cls,joe@corp.co,call 083 111 2222\n';
      await m.setInputFiles('#imp-file', { name: 'inc.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
      await m.getByText('look like personal data').waitFor();
      expect(await m.locator('.notice.err').first().innerText()).toMatch(/reporter email/);
      expect(await m.getByText('Keep “reporter email”').count()).toBe(0); // only an Admin may retain
      await m.getByRole('button', { name: 'Import' }).click();
      await m.getByText(/Imported: 2 new/).waitFor();
      expect(await m.locator('main').innerText()).toMatch(/src\/Nope\.cls/);
      const a = await as('ADMIN'); await goto(a, '/explore');
      await a.locator('summary', { hasText: 'Import tickets or incidents' }).click();
      await a.setInputFiles('#imp-file', { name: 'inc.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
      await a.getByText('Keep “reporter email”').waitFor();
    });
  });

  describe('projects and analysis', () => {
    it('a Contributor creates a project, runs the deterministic analysis without AI, and sees the graph cross-check', async () => {
      const p = await as('CONTRIBUTOR'); await goto(p, '/projects/new');
      await p.fill('#np-name', 'E2E collections change');
      await p.fill('#np-desc', 'Brokers want debit-order and payroll clients to be able to choose "last day of the month" as their collection day.');
      expect(await p.locator('main').innerText()).toMatch(/PDF is not supported/);
      await p.getByRole('button', { name: 'Create project' }).click();
      await p.waitForURL(/\/projects\/[^/]+$/);
      await p.getByRole('button', { name: 'Analyse' }).click();
      await p.getByText('Code-graph cross-check').waitFor();
      const txt = await p.locator('main').innerText();
      expect(txt).toMatch(/AI analysis is not configured/); expect(txt).toMatch(/CollectionInstruction/); expect(txt).toMatch(/INC-2291/);
      expect(await p.getByText('This analysis matches the current source.').count()).toBe(1);
    });
    it('the full AI result page shows the sections in order with evidence chips and downloads', async () => {
      const p = await as('VIEWER'); await goto(p, `/projects/${web.projectId}`);
      const heads = await p.locator('section.sec > h2').allInnerTexts();
      expect(heads).toEqual(['What this means', 'Affected processes — today vs after', 'Questions to settle first', 'Risks', 'Solution plan', 'What changes', 'Generated tests', 'Tasks to log']);
      expect(await p.locator('pre.code').count()).toBe(0); // test code is hidden for the business audience
      expect(await p.locator('.risk .chip', { hasText: 'INC-2291' }).count()).toBeGreaterThan(0);
      await p.locator('.risk .chip', { hasText: 'INC-2291' }).first().click(); await p.waitForURL(/e\/incident/);
      await p.goBack();
      const r = await p.request.get(`/api/analyses/${web.aiAnalysisId}/export?kind=jira-csv`);
      expect(r.status()).toBe(200);
      expect(r.headers()['content-disposition']).toMatch(/attachment; filename=".*tasks\.csv"/);
      expect(r.headers()['x-content-type-options']).toBe('nosniff');
      expect((await r.text()).split('\n')[0]).toBe('Summary,Issue Type,Description,Labels,Priority,Log in,Owner,Depends on,Lens id');
      expect(await p.getByText(/prompt lens-analysis/).count()).toBeGreaterThan(0); // provenance line
    });
    it('a later sync makes the analysis stale and offers a re-run; the old analysis is unchanged', async () => {
      web.env.gl.advance('9e2e0001', (f) => { const k = `${P}src/domain/entities/CollectionInstruction.cls`; f.set(k, f.get(k)! + '\n/* e2e */\n'); });
      await web.env.syncNow(web.source.id);
      const p = await as('CONTRIBUTOR'); await goto(p, `/projects/${web.projectId}`);
      expect(await p.getByText('Source has changed since this analysis.').count()).toBe(1);
      expect(await p.getByRole('button', { name: 'Re-run analysis' }).count()).toBeGreaterThan(0);
      const txt = await p.locator('.stale').first().innerText();
      expect(txt).toMatch(/Git SHA aaaaaaa/); expect(txt).toMatch(/9e2e000/);
      expect(await p.getByText('Risks').first().isVisible()).toBe(true); // the historical result is still shown
    });
    it('audience switch changes summaries, plan tab and code visibility but not permissions', async () => {
      const p = await as('VIEWER'); await goto(p, `/projects/${web.projectId}`);
      expect(await p.locator('pre.code').count()).toBe(0);
      expect(await p.locator('main').innerText()).not.toContain('Technical');
      await p.getByRole('button', { name: 'Developer' }).click(); await p.waitForTimeout(900); await p.reload();
      const dev = await p.locator('main').innerText();
      expect(await p.locator('pre.code').count()).toBeGreaterThan(0); expect(dev).toContain('Technical');
      expect(await p.getByRole('tab', { name: 'Developer', selected: true }).count()).toBe(1);
      expect(await p.getByRole('link', { name: 'New change' }).count()).toBe(0);
      await p.getByRole('button', { name: 'Business analyst' }).click(); await p.waitForTimeout(600);
    });
  });

  describe('theme', () => {
    it('toggles dark mode, remembers it per user, and never follows prefers-color-scheme', async () => {
      const p = await as('VIEWER', { colorScheme: 'dark' });
      await goto(p, '/projects');
      expect(await p.locator('html').getAttribute('class') ?? '').not.toContain('lens-dark'); // OS dark does not switch the theme
      await p.getByRole('button', { name: /Dark mode/ }).click(); await p.waitForTimeout(700);
      expect(await p.locator('html').getAttribute('class')).toContain('lens-dark');
      await p.reload(); expect(await p.locator('html').getAttribute('class')).toContain('lens-dark');
      const other = await as('VIEWER'); await goto(other, '/projects'); // a fresh browser, same user: preference is stored server-side
      expect(await other.locator('html').getAttribute('class')).toContain('lens-dark');
      await p.getByRole('button', { name: /Light mode/ }).click(); await p.waitForTimeout(700);
      expect(await p.locator('html').getAttribute('class') ?? '').not.toContain('lens-dark');
    });
    it('before sign-in the theme comes from localStorage', async () => {
      const p = await as(null); await goto(p, '/signin');
      await p.getByRole('button', { name: /Dark mode/ }).click();
      await p.reload();
      expect(await p.locator('html').getAttribute('class')).toContain('lens-dark');
    });
  });

  describe('process packs', () => {
    it('opens the interactive prototype in a sandboxed iframe (scripts only, no same-origin); Escape closes it', async () => {
      const p = await as('VIEWER'); await goto(p, `/explore/${web.source.id}/process/New%20Business%20Process`);
      await p.getByRole('button', { name: /Interactive prototype/ }).click();
      const frameEl = p.locator('iframe[title*="Interactive prototype"]');
      expect(await frameEl.getAttribute('sandbox')).toBe('allow-scripts');
      const fr = p.frameLocator('iframe[title*="Interactive prototype"]');
      await fr.locator('.step').first().waitFor();
      expect(await fr.locator('.step').count()).toBe(7);
      // opaque origin: the frame cannot read the app's cookies or storage
      const frame = p.frames().find((f) => f.url().includes('/api/pack-frame'))!;
      expect(await frame.evaluate(() => { try { void document.cookie; return 'readable'; } catch { return 'blocked'; } })).toBe('blocked');
      expect(await frame.evaluate(() => { try { void localStorage.length; return 'readable'; } catch { return 'blocked'; } })).toBe('blocked');
      await p.keyboard.press('Escape');
      await frameEl.waitFor({ state: 'detached' });
    });
    it('the frame route sets its own sandbox CSP even when opened directly; downloads are attachments', async () => {
      const p = await as('VIEWER');
      const q = `sourceId=${web.source.id}&process=New%20Business%20Process`;
      const r = await p.request.get(`/api/pack-frame?${q}&kind=doc&theme=dark`);
      expect(r.status()).toBe(200);
      expect(r.headers()['content-security-policy']).toMatch(/^sandbox allow-scripts;/);
      expect(r.headers()['content-security-policy']).toContain("connect-src 'none'");
      expect(await r.text()).toContain('data-theme="dark"');
      const d = await p.request.get(`/api/pack?${q}&kind=config-yaml`);
      expect(d.headers()['content-disposition']).toMatch(/attachment; filename=".*\.sandbox\.yaml"/);
      expect(await d.text()).toContain('kind: SandboxConfig');
      const bad = await p.request.get(`/api/pack-frame?${q}&kind=markdown`); expect(bad.status()).toBe(400);
    });
    it('shows the sandbox config with baseline schema before deltas', async () => {
      const p = await as('VIEWER'); await goto(p, `/explore/${web.source.id}/process/New%20Business%20Process`);
      await p.getByRole('button', { name: /Sandbox config/ }).click();
      const txt = await p.locator('pre.pack-pre').innerText();
      expect(txt.indexOf('newbusiness.df')).toBeGreaterThan(-1);
      expect(txt.indexOf('newbusiness.df')).toBeLessThan(txt.indexOf('002_benefit_cover_amount.df'));
      expect(txt).toContain('SeedData.p');
    });
  });

  describe('progress over SSE', () => {
    it('streams a finished sync run: progress event(s) then done', async () => {
      const run = await (await import('../helpers/services')).db!.syncRun.findFirst({ where: { sourceId: web.source.id }, orderBy: { startedAt: 'desc' } });
      const p = await as('VIEWER');
      const res = await p.request.get(`/api/events/sync/${run!.id}`);
      expect(res.headers()['content-type']).toContain('text/event-stream');
      const body = await res.text();
      expect(body).toContain('event: progress'); expect(body).toContain('event: done');
    });
    it('progress for a source the user cannot see is a 404', async () => {
      const run = await (await import('../helpers/services')).db!.syncRun.findFirst({ where: { sourceId: web.source.id } });
      const o = await as('outsider'); expect((await o.request.get(`/api/events/sync/${run!.id}`)).status()).toBe(404);
    });
  });

  describe('accessibility and responsiveness (WCAG 2.2 AA checks with axe-core)', () => {
    const pages: [string, () => string][] = [
      ['projects', () => '/projects'], ['explore', () => '/explore'], ['history', () => '/history'], ['new project', () => '/projects/new'],
      ['project results', () => `/projects/${web.projectId}`], ['process page', () => `/explore/${web.source.id}/process/New%20Business%20Process`],
      ['class page', () => `/explore/${web.source.id}/e/file/${P}src/domain/entities/CollectionInstruction.cls`],
    ];
    const audit = async (p: Page) => {
      await p.addScriptTag({ content: axeSource });
      return p.evaluate(async () => {
        const r = await (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
        return r.violations.map((v: any) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n: any) => n.target.join(' ')) }));
      });
    };
    for (const theme of ['light', 'dark'] as const) for (const [label, url] of pages) {
      it(`${label} (${theme}) has no axe violations`, async () => {
        const p = await as('CONTRIBUTOR'); await p.context().addCookies([{ name: 'lens-theme', value: theme, url: web.url }]);
        await goto(p, url());
        if (theme === 'dark') await p.evaluate(() => document.documentElement.classList.add('lens-dark'));
        if (theme === 'light') await p.evaluate(() => document.documentElement.classList.remove('lens-dark'));
        const v = await audit(p);
        expect(v, JSON.stringify(v, null, 1)).toEqual([]);
      });
    }
    it('works at 390px wide: no horizontal page scroll; process rail scrolls within its own container', async () => {
      const p = await as('VIEWER', { viewport: { width: 390, height: 800 } });
      for (const u of ['/projects', '/explore', '/history', `/projects/${web.projectId}`, `/explore/${web.source.id}/process/New%20Business%20Process`]) {
        await goto(p, u);
        const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(over, u).toBeLessThanOrEqual(0);
      }
      expect(await p.locator('.rail-scroll').evaluate((e) => getComputedStyle(e).overflowX)).toBe('auto');
    });
    it('keyboard: skip link, arrow keys move between tabs, and focus is visible', async () => {
      const p = await as('VIEWER'); await goto(p, '/projects');
      await p.keyboard.press('Tab');
      expect(await p.evaluate(() => document.activeElement?.className)).toContain('skip');
      await p.getByRole('tab', { name: 'Projects' }).focus();
      await p.keyboard.press('ArrowRight');
      expect(await p.evaluate(() => document.activeElement?.textContent)).toBe('Explore the system');
      const outline = await p.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
      expect(outline).not.toBe('none');
    });
    it('live regions announce progress', async () => {
      const p = await as('MAINTAINER'); await goto(p, '/explore');
      expect(await p.locator('[aria-live="polite"]').count()).toBeGreaterThan(0);
    });
  });
});
