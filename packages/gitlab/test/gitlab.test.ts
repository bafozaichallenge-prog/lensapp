import { describe, it, expect, vi } from 'vitest';
import AdmZip from 'adm-zip';
import type { CommitInput, SourceFile } from '@lens/core';
import { parseSource } from '@lens/ingest';
import { SnapshotStore } from '@lens/graph';
import { GitLabClient, GitLabHttpError, withRetry, mapLimit, shouldIngest, planSync, syncSource, type SyncDeps } from '../src';

const noSleep = () => Promise.resolve();

describe('retry', () => {
  it('honours Retry-After on 429', async () => {
    const sleeps: number[] = [];
    let n = 0;
    const r = await withRetry(async () => { if (n++ < 2) throw new GitLabHttpError(429, 'slow down', 7); return 'ok'; }, { sleep: async (ms) => { sleeps.push(ms); } });
    expect(r).toBe('ok');
    expect(sleeps).toEqual([7000, 7000]);
  });
  it('backs off exponentially on 5xx and gives up after 5 retries', async () => {
    const sleeps: number[] = [];
    const fn = vi.fn(async () => { throw new GitLabHttpError(503, 'down'); });
    await expect(withRetry(fn, { baseDelayMs: 100, sleep: async (ms) => { sleeps.push(ms); } })).rejects.toThrow('down');
    expect(fn).toHaveBeenCalledTimes(6); // 1 try + 5 retries
    expect(sleeps).toEqual([100, 200, 400, 800, 1600]);
  });
  it('does not retry ordinary 4xx', async () => {
    const fn = vi.fn(async () => { throw new GitLabHttpError(403, 'no'); });
    await expect(withRetry(fn, { sleep: noSleep })).rejects.toThrow('no');
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('mapLimit never exceeds the concurrency cap', async () => {
    let live = 0, peak = 0;
    const out = await mapLimit([...Array(20).keys()], 4, async (i) => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 2)); live--; return i * 2; });
    expect(peak).toBeLessThanOrEqual(4);
    expect(out[19]).toBe(38);
  });
});

describe('ingest filter', () => {
  it('keeps ABL/doc types and skips .git, node_modules, build output and files over 2 MB', () => {
    expect(shouldIngest('src/A.cls', 100)).toBe(true);
    expect(shouldIngest('db/x.df', 100)).toBe(true);
    expect(shouldIngest('img/logo.png', 100)).toBe(false);
    expect(shouldIngest('node_modules/x/a.json', 100)).toBe(false);
    expect(shouldIngest('build/out.p', 100)).toBe(false);
    expect(shouldIngest('src/Big.cls', 2 * 1024 * 1024 + 1)).toBe(false);
    expect(shouldIngest('other/A.cls', 1, ['src/'])).toBe(false);
  });
});

describe('sync planning', () => {
  it('chooses skip / full / incremental', () => {
    expect(planSync({ headSha: 'a' })).toMatchObject({ mode: 'full' });
    expect(planSync({ headSha: 'a', activeSha: 'a' })).toMatchObject({ mode: 'skip' });
    expect(planSync({ headSha: 'b', activeSha: 'a', changedFiles: 20 })).toMatchObject({ mode: 'incremental' });
    expect(planSync({ headSha: 'b', activeSha: 'a', changedFiles: 501 })).toMatchObject({ mode: 'full' });
    expect(planSync({ headSha: 'b', activeSha: 'a', changedFiles: null })).toMatchObject({ mode: 'full' });
    expect(planSync({ headSha: 'a', activeSha: 'a', forceFull: true })).toMatchObject({ mode: 'full' });
  });
});

describe('GitLabClient', () => {
  const json = (b: unknown, status = 200, h: Record<string, string> = {}) => new Response(JSON.stringify(b), { status, headers: h });
  it('sends the token as a header, never in the URL', async () => {
    const f = vi.fn(async () => json({ commit: { id: 'abc' } }));
    const c = new GitLabClient({ baseUrl: 'https://gl.example/', token: 'glpat-SECRET', fetch: f as unknown as typeof fetch });
    expect(await c.headSha(1, 'main')).toBe('abc');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain('SECRET');
    expect((init.headers as Record<string, string>)['PRIVATE-TOKEN']).toBe('glpat-SECRET');
  });
  it('compare returns null when the previous SHA is gone', async () => {
    const c = new GitLabClient({ baseUrl: 'https://gl', token: 't', fetch: (async () => json({}, 404)) as unknown as typeof fetch });
    expect(await c.compare(1, 'old', 'new')).toBeNull();
  });
  it('retries a 429 through the client', async () => {
    let n = 0;
    const f = async () => (n++ === 0 ? json({}, 429, { 'retry-after': '0' }) : json({ commit: { id: 'z' } }));
    const c = new GitLabClient({ baseUrl: 'https://gl', token: 't', fetch: f as unknown as typeof fetch, retry: { sleep: noSleep } });
    expect(await c.headSha(1, 'main')).toBe('z');
  });
  it('unpacks the archive, strips the top folder and filters files', async () => {
    const zip = new AdmZip();
    zip.addFile('repo-abc/src/A.cls', Buffer.from('CLASS A:'));
    zip.addFile('repo-abc/logo.png', Buffer.from('x'));
    zip.addFile('repo-abc/node_modules/x.json', Buffer.from('{}'));
    const c = new GitLabClient({ baseUrl: 'https://gl', token: 't', fetch: (async () => new Response(new Uint8Array(zip.toBuffer()))) as unknown as typeof fetch });
    const files = await c.archive(1, 'abc');
    expect(files.map((f) => f.path)).toEqual(['src/A.cls']);
  });
  it('builds history: numstat per commit, merge commits name branches and are dropped', async () => {
    const commits = [
      { id: 'm'.repeat(40), author_name: 'A', committed_date: '2026-01-03T00:00:00Z', title: "Merge branch 'feature/x' into 'main'", parent_ids: ['a'.repeat(40), 'b'.repeat(40)] },
      { id: 'b'.repeat(40), author_name: 'A', committed_date: '2026-01-02T00:00:00Z', title: 'feat: x NBJ-1', parent_ids: ['c'.repeat(40)] },
    ];
    const f = async (url: string) => (url.includes('/diff') ? json([{ new_path: 'src/A.cls', diff: '@@\n+a\n+b\n-c\n' }]) : json(commits));
    const c = new GitLabClient({ baseUrl: 'https://gl', token: 't', fetch: f as unknown as typeof fetch });
    const h = await c.history(1, 'main');
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ branch: 'feature/x', files: [{ path: 'src/A.cls', additions: 2, deletions: 1 }] });
  });
});

// ---- syncSource scenarios (plan §8, M2 gate) ------------------------------------------------------
const cls = (n: string, body = '') => ({ path: `src/${n}.cls`, bytes: new TextEncoder().encode(`CLASS ${n}:\n${body}END CLASS.`) });
const many = (n: number) => Array.from({ length: n }, (_, i) => cls(`C${i}`));

function harness(init: { head: string; repo: ReturnType<typeof many>; compare?: (projectId: number, from: string, to: string) => Promise<any> }) {
  const state = { head: init.head, repo: init.repo, calls: { archive: 0, files: 0 } };
  const snaps = new SnapshotStore();
  const stored = new Map<string, { sha: string; files: SourceFile[] }>();
  const locks = new Set<string>();
  const stages: string[] = [];
  const deps: SyncDeps = {
    source: async (id) => ({ id, projectId: 1, branch: 'main', pathFilters: [] }),
    gitlab: {
      headSha: async () => state.head,
      compare: init.compare ?? (async (_p, _f, _t) => ({ commits: [], diffs: [{ new_path: 'src/C0.cls', old_path: 'src/C0.cls', deleted_file: false, new_file: false, renamed_file: false }] })),
      archive: async () => { state.calls.archive++; return state.repo; },
      files: async (_p, paths) => { state.calls.files++; return state.repo.filter((r) => paths.includes(r.path)); },
      history: async () => [] as CommitInput[],
    },
    active: async (id) => stored.get(id),
    parse: (files, history) => parseSource(files, history),
    commit: async (id, sha, files, _h, graph) => {
      const s = snaps.begin(id, sha); const r = snaps.commit(s.id, graph);
      if (r.status === 'ACTIVE') stored.set(id, { sha, files });
      return { ok: r.status === 'ACTIVE', issues: r.issues.map((i) => i.message) };
    },
    acquire: async (id) => (locks.has(id) ? false : (locks.add(id), true)),
    release: async (id) => { locks.delete(id); },
    progress: (_id, s) => { stages.push(s); },
  };
  return { state, snaps, stored, deps, stages, locks };
}

describe('syncSource', () => {
  it('first sync is full and records the head SHA', async () => {
    const h = harness({ head: 'sha1', repo: many(20) });
    const r = await syncSource('s', h.deps);
    expect(r).toMatchObject({ status: 'done', mode: 'full', sha: 'sha1' });
    expect(h.snaps.active('s')!.sha).toBe('sha1');
    expect(h.stages).toEqual(['fetching code', 'fetching history', 'parsing', 'linking', 'snapshotting', 'done']);
  });
  it('a second sync with no changes creates no new snapshot', async () => {
    const h = harness({ head: 'sha1', repo: many(20) });
    await syncSource('s', h.deps);
    const r = await syncSource('s', h.deps);
    expect(r.status).toBe('skipped');
    expect(h.snaps.all('s')).toHaveLength(1);
    expect(h.state.calls.archive).toBe(1);
  });
  it('a moved head is synced incrementally: only changed files are fetched', async () => {
    const h = harness({ head: 'sha1', repo: many(20) });
    await syncSource('s', h.deps);
    h.state.head = 'sha2'; h.state.repo = [cls('C0', '/* changed */\n'), ...many(20).slice(1)];
    const r = await syncSource('s', h.deps);
    expect(r).toMatchObject({ status: 'done', mode: 'incremental' });
    expect(h.state.calls.archive).toBe(1);
    expect(h.state.calls.files).toBe(1);
    expect(h.stored.get('s')!.files.find((f) => f.path === 'src/C0.cls')!.text).toContain('changed');
    expect(h.stored.get('s')!.files).toHaveLength(20);
  });
  it('a missing previous SHA (force-push) falls back to a full sync', async () => {
    const h = harness({ head: 'sha1', repo: many(20), compare: async () => null });
    await syncSource('s', h.deps);
    h.state.head = 'sha2';
    const r = await syncSource('s', h.deps);
    expect(r).toMatchObject({ status: 'done', mode: 'full' });
    expect(h.state.calls.archive).toBe(2);
  });
  it('more than 500 changed files falls back to a full sync', async () => {
    const big = { commits: [], diffs: Array.from({ length: 501 }, (_, i) => ({ new_path: `f${i}.cls`, old_path: `f${i}.cls`, deleted_file: false, new_file: true, renamed_file: false })) };
    const h = harness({ head: 'sha1', repo: many(20), compare: async () => big });
    await syncSource('s', h.deps);
    h.state.head = 'sha2';
    expect((await syncSource('s', h.deps)).mode).toBe('full');
  });
  it('removed files are dropped on an incremental sync', async () => {
    const h = harness({ head: 'sha1', repo: many(20), compare: async () => ({ commits: [], diffs: [{ new_path: 'src/C1.cls', old_path: 'src/C1.cls', deleted_file: true, new_file: false, renamed_file: false }] }) });
    await syncSource('s', h.deps);
    h.state.head = 'sha2';
    await syncSource('s', h.deps);
    expect(h.stored.get('s')!.files.some((f) => f.path === 'src/C1.cls')).toBe(false);
  });
  it('a GitLab failure leaves the previous snapshot active and releases the lock', async () => {
    const h = harness({ head: 'sha1', repo: many(20) });
    await syncSource('s', h.deps);
    h.state.head = 'sha2';
    h.deps.gitlab.compare = async () => { throw new GitLabHttpError(500, 'boom'); };
    const r = await syncSource('s', h.deps);
    expect(r.status).toBe('failed');
    expect(h.snaps.active('s')!.sha).toBe('sha1');
    expect(h.locks.has('s')).toBe(false);
  });
  it('a graph that collapses is rejected and the old snapshot stays active', async () => {
    const h = harness({ head: 'sha1', repo: many(20) });
    await syncSource('s', h.deps);
    h.state.head = 'sha2'; h.state.repo = many(3);
    const r = await syncSource('s', h.deps, { full: true });
    expect(r.status).toBe('failed');
    expect(h.snaps.active('s')!.sha).toBe('sha1');
  });
  it('a second click while running does not start another job', async () => {
    const h = harness({ head: 'sha1', repo: many(20) });
    let release!: () => void; const gate = new Promise<void>((r) => (release = r));
    const slow = h.deps.gitlab.archive; h.deps.gitlab.archive = async (...a) => { await gate; return slow(...a); };
    const first = syncSource('s', h.deps);
    await new Promise((r) => setTimeout(r, 5));
    expect((await syncSource('s', h.deps)).status).toBe('busy');
    release(); expect((await first).status).toBe('done');
  });
});
