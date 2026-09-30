import AdmZip from 'adm-zip';
import type { CommitInput } from '@lens/core';
import { GitLabHttpError, withRetry, mapLimit, type RetryOptions } from './retry';
import { shouldIngest } from './filter';

export interface GitLabProject { id: number; path_with_namespace: string; default_branch: string; name: string }
export interface CompareResult { commits: { id: string }[]; diffs: { new_path: string; old_path: string; deleted_file: boolean; new_file: boolean; renamed_file: boolean }[] }
export interface RepoFile { path: string; bytes: Uint8Array; blobSha?: string }

export interface GitLabClientOptions {
  baseUrl: string;
  token: string;               // never logged or returned to the browser
  fetch?: typeof fetch;
  retry?: RetryOptions;
  concurrency?: number;        // default 4
}

export class GitLabClient {
  private f: typeof fetch;
  constructor(private o: GitLabClientOptions) { this.f = o.fetch ?? fetch; }

  private async raw(path: string, accept = 'application/json'): Promise<Response> {
    return withRetry(async () => {
      let res: Response;
      try { res = await this.f(`${this.o.baseUrl.replace(/\/$/, '')}/api/v4${path}`, { headers: { 'PRIVATE-TOKEN': this.o.token, accept } }); }
      catch (e) { throw new GitLabHttpError(0, `Network error: ${(e as Error).message}`); }
      if (!res.ok) throw new GitLabHttpError(res.status, `GitLab ${res.status} for ${path}`, Number(res.headers.get('retry-after')) || undefined);
      return res;
    }, this.o.retry);
  }
  private async json<T>(path: string): Promise<T> { return (await this.raw(path)).json() as Promise<T>; }

  searchProjects(q: string): Promise<GitLabProject[]> { return this.json(`/projects?membership=true&simple=true&per_page=20&search=${encodeURIComponent(q)}`); }
  getProject(idOrPath: string | number): Promise<GitLabProject> { return this.json(`/projects/${encodeURIComponent(String(idOrPath))}`); }
  async headSha(projectId: number, branch: string): Promise<string> {
    return (await this.json<{ commit: { id: string } }>(`/projects/${projectId}/repository/branches/${encodeURIComponent(branch)}`)).commit.id;
  }

  /** Returns null when the previous SHA no longer exists (force-push) so the caller falls back to a full sync. */
  async compare(projectId: number, from: string, to: string): Promise<CompareResult | null> {
    try { return await this.json<CompareResult>(`/projects/${projectId}/repository/compare?from=${from}&to=${to}&straight=true`); }
    catch (e) { if (e instanceof GitLabHttpError && (e.status === 404 || e.status === 400)) return null; throw e; }
  }

  /** Full archive at `sha`, filtered to ingestable files. The archive's top-level folder is stripped. */
  async archive(projectId: number, sha: string, pathFilters: string[] = []): Promise<RepoFile[]> {
    const buf = Buffer.from(await (await this.raw(`/projects/${projectId}/repository/archive.zip?sha=${sha}`, 'application/zip')).arrayBuffer());
    const zip = new AdmZip(buf);
    const out: RepoFile[] = [];
    for (const e of zip.getEntries()) {
      if (e.isDirectory) continue;
      const path = e.entryName.split('/').slice(1).join('/');
      if (!shouldIngest(path, e.header.size, pathFilters)) continue;
      out.push({ path, bytes: e.getData() });
    }
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }

  async fileRaw(projectId: number, path: string, ref: string): Promise<Uint8Array> {
    const res = await this.raw(`/projects/${projectId}/repository/files/${encodeURIComponent(path)}/raw?ref=${ref}`, '*/*');
    return new Uint8Array(await res.arrayBuffer());
  }

  /** Fetch the added/modified files only (incremental sync); at most `concurrency` requests in flight. */
  async files(projectId: number, paths: string[], ref: string): Promise<RepoFile[]> {
    return mapLimit(paths, this.o.concurrency ?? 4, async (path) => ({ path, bytes: await this.fileRaw(projectId, path, ref) }));
  }

  /** Commits with per-file numstat. Depth-limited: per-commit diff calls dominate sync time on large histories. */
  async history(projectId: number, branch: string, opts: { since?: string; maxCommits?: number } = {}): Promise<CommitInput[]> {
    const max = opts.maxCommits ?? 500;
    const list: { id: string; author_name: string; committed_date: string; title: string; parent_ids: string[] }[] = [];
    for (let page = 1; list.length < max; page++) {
      const q = `/projects/${projectId}/repository/commits?ref_name=${encodeURIComponent(branch)}&per_page=100&page=${page}${opts.since ? `&since=${encodeURIComponent(opts.since)}` : ''}`;
      const chunk = await this.json<typeof list>(q);
      list.push(...chunk);
      if (chunk.length < 100) break;
    }
    const commits = list.slice(0, max);
    const withFiles = await mapLimit(commits, this.o.concurrency ?? 4, async (c) => {
      if (c.parent_ids.length > 1) return { c, files: [] as CommitInput['files'] };
      const diffs = await this.json<{ new_path: string; diff: string }[]>(`/projects/${projectId}/repository/commits/${c.id}/diff?per_page=100`);
      return { c, files: diffs.map((d) => ({ path: d.new_path, additions: (d.diff.match(/^\+(?!\+\+)/gm) ?? []).length, deletions: (d.diff.match(/^-(?!--)/gm) ?? []).length })) };
    });
    // branch names come from merge-commit subjects (same rule as the offline log parser)
    const branchOf: Record<string, string> = {};
    for (const { c } of withFiles) {
      const m = c.title.match(/^Merge (?:remote-tracking )?branch '([^']+)'/);
      if (m && c.parent_ids.length === 2 && !['main', 'develop', 'master', 'origin/main'].includes(m[1]!)) branchOf[c.parent_ids[1]!] ||= m[1]!;
    }
    return withFiles.filter(({ c }) => c.parent_ids.length < 2).map(({ c, files }) => ({
      sha: c.id, author: c.author_name, date: c.committed_date, subject: c.title, parents: c.parent_ids, branch: branchOf[c.id], files,
    })).sort((a, b) => a.date.localeCompare(b.date));
  }
}
