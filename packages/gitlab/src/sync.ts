import type { CommitInput, GraphInput, SourceFile } from '@lens/core';
import { decodeSource } from '@lens/ingest';
import { planSync, type SyncMode } from './plan';
import { shouldIngest } from './filter';
import type { CompareResult, RepoFile } from './client';

export type SyncStage = 'queued' | 'fetching code' | 'fetching history' | 'parsing' | 'linking' | 'snapshotting' | 'done' | 'failed';

export interface SourceConfig { id: string; projectId: number; branch: string; pathFilters: string[] }

/** Everything syncSource() needs, injected so a scheduler, webhook or test can call it identically (plan §8.6). */
export interface SyncDeps {
  source(id: string): Promise<SourceConfig>;
  gitlab: {
    headSha(projectId: number, branch: string): Promise<string>;
    compare(projectId: number, from: string, to: string): Promise<CompareResult | null>;
    archive(projectId: number, sha: string, filters: string[]): Promise<RepoFile[]>;
    files(projectId: number, paths: string[], ref: string): Promise<RepoFile[]>;
    history(projectId: number, branch: string): Promise<CommitInput[]>;
  };
  /** Currently active snapshot for the source, with the file contents it was built from. */
  active(sourceId: string): Promise<{ sha: string; files: SourceFile[] } | undefined>;
  parse(files: SourceFile[], history: CommitInput[]): Promise<GraphInput>;
  /** Validate + activate atomically; must leave the previous snapshot active when it returns ok:false. */
  commit(sourceId: string, sha: string, files: SourceFile[], history: CommitInput[], graph: GraphInput): Promise<{ ok: boolean; issues: string[] }>;
  /** Single-flight guard: returns false when a run for this source is already queued/running. */
  acquire(sourceId: string): Promise<boolean>;
  release(sourceId: string): Promise<void>;
  progress?(sourceId: string, stage: SyncStage, message?: string): void;
}

export interface SyncResult { status: 'skipped' | 'done' | 'failed' | 'busy'; mode?: SyncMode; sha?: string; reason?: string; error?: string }

/**
 * Manual sync today; the same entry point can be driven by a scheduler or webhook later.
 * A failure at any stage leaves the previously active snapshot untouched.
 */
export async function syncSource(sourceId: string, deps: SyncDeps, opts: { full?: boolean } = {}): Promise<SyncResult> {
  if (!(await deps.acquire(sourceId))) return { status: 'busy', reason: 'sync already queued or running' };
  const say = (s: SyncStage, m?: string) => deps.progress?.(sourceId, s, m);
  try {
    const src = await deps.source(sourceId);
    say('fetching code', 'resolving branch head');
    const head = await deps.gitlab.headSha(src.projectId, src.branch);
    const active = await deps.active(sourceId);
    let changed: CompareResult | null | undefined;
    if (active && active.sha !== head && !opts.full) changed = await deps.gitlab.compare(src.projectId, active.sha, head);
    const plan = planSync({ headSha: head, activeSha: active?.sha, forceFull: opts.full, changedFiles: changed === null ? null : changed?.diffs.length });
    if (plan.mode === 'skip') { say('done', plan.reason); return { status: 'skipped', mode: 'skip', sha: head, reason: plan.reason }; }

    let files: SourceFile[];
    if (plan.mode === 'full' || !active || !changed) {
      const repo = await deps.gitlab.archive(src.projectId, head, src.pathFilters);
      files = repo.map((f) => ({ path: f.path, text: decodeSource(f.bytes) }));
    } else {
      const removed = new Set(changed.diffs.filter((d) => d.deleted_file || d.renamed_file).map((d) => d.old_path));
      const upsert = changed.diffs.filter((d) => !d.deleted_file).map((d) => d.new_path).filter((p) => shouldIngest(p, 0, src.pathFilters));
      const fetched = await deps.gitlab.files(src.projectId, upsert, head);
      const byPath = new Map(active.files.filter((f) => !removed.has(f.path)).map((f) => [f.path, f]));
      for (const f of fetched) byPath.set(f.path, { path: f.path, text: decodeSource(f.bytes) });
      files = [...byPath.values()];
    }
    say('fetching history');
    const history = await deps.gitlab.history(src.projectId, src.branch);
    say('parsing');
    const graph = await deps.parse(files, history);
    say('linking');
    say('snapshotting');
    const res = await deps.commit(sourceId, head, files, history, graph);
    if (!res.ok) { say('failed', res.issues.join('; ')); return { status: 'failed', mode: plan.mode, sha: head, error: res.issues.join('; ') }; }
    say('done');
    return { status: 'done', mode: plan.mode, sha: head, reason: plan.reason };
  } catch (e) {
    const msg = (e as Error).message;
    say('failed', msg);
    return { status: 'failed', error: msg };
  } finally {
    await deps.release(sourceId);
  }
}
