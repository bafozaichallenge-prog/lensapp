/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'node:fs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright-core';
import { loadFixture } from '../helpers/fixture';
import { toPackGraph, buildSpec, artefactHtml } from '@lens/pack';

const exe = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const have = fs.existsSync(exe);

describe.skipIf(!have)('interactive prototype (real browser, real template)', () => {
  let browser: Browser; let page: Page; let html: string;
  const errors: string[] = [];

  beforeAll(async () => {
    const fx = await loadFixture();
    const g = toPackGraph({ graph: fx.graph, view: fx.view, files: fx.source, commits: fx.commits, tickets: fx.tickets.map((t) => ({ key: t.key, commit: t.commit })),
      incidents: fx.incidents.map((n) => ({ key: n.key, title: n.title, status: n.status, severity: n.severity, rootCause: n.rootCause, files: n.resolved.map((r) => r.resolved ?? r.input), reqs: n.reqs })) });
    html = artefactHtml('prototype', buildSpec(g, 0, { source: 'BafozAIChallenge-project', vertical: 'Personal Insurance' }));
    browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  }, 60_000);
  afterAll(async () => { await browser?.close(); });

  const open = async () => {
    page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    // block the external font request: the page must work without it
    await page.route(/^https?:\/\//, (r) => r.abort());
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
  };
  const gotoStep = (i: number) => page.click(`.step[data-i="${i}"]`);
  const fillSample = async () => { await page.click('[data-go="fill"]'); };
  const fillAllForms = async () => { for (const i of [0, 1, 2, 3, 4]) { await gotoStep(i); if (await page.$('[data-go="fill"]')) await fillSample(); } };
  const validate = async () => { await gotoStep(5); await page.click('[data-go="validate"]'); };
  const result = (code: string) => page.locator('.res', { hasText: code });

  it('renders all seven steps without script errors', async () => {
    await open();
    expect(await page.locator('.step').count()).toBe(7);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('a monthly debit order on day 31 fails NB-COLLECTION-002; day 25 passes', async () => {
    await open();
    await fillAllForms();
    await gotoStep(4);
    const day = page.locator('[data-k="CollectionInstruction.CollectionDay"]');
    await day.fill('31');
    await validate();
    const bad = result('NB-COLLECTION-002');
    await expect(bad.getAttribute('class')).resolves.toContain('bad');
    expect(await bad.innerText()).toMatch(/between 1 and 28/);

    await gotoStep(4);
    await page.locator('[data-k="CollectionInstruction.CollectionDay"]').fill('25');
    await validate();
    await expect(result('NB-COLLECTION-002').getAttribute('class')).resolves.toContain('ok');
    await page.close();
  });

  it('activation is allowed only as SUPERVISOR or ADMIN, and only after validation passes', async () => {
    await open();
    await fillAllForms();
    await validate();
    expect(await page.locator('.res.bad').count(), await page.locator('#phone').innerText()).toBe(0);
    await gotoStep(6);
    const act = page.locator('[data-go="act"]');
    await page.selectOption('#role', 'NEW_BUSINESS_AGENT');
    await expect(act.isDisabled()).resolves.toBe(true);
    await page.selectOption('#role', 'SUPERVISOR');
    await expect(act.isDisabled()).resolves.toBe(false);
    await act.click();
    expect(await page.locator('.status b').innerText()).toBe('IN-FORCE');
    await page.close();
  });

  it('changing the application after validation invalidates it (activation blocked again)', async () => {
    await open();
    await fillAllForms();
    await validate();
    await gotoStep(2);
    await page.locator('[data-k="Person.FirstName"]').fill('Changed');
    await gotoStep(6);
    await page.selectOption('#role', 'ADMIN');
    await expect(page.locator('[data-go="act"]').isDisabled()).resolves.toBe(true);
    await page.close();
  });
});
