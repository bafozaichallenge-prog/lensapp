export type SyncMode = 'skip' | 'full' | 'incremental';
export interface PlanInput {
  headSha: string;
  activeSha?: string;          // SHA of the currently active snapshot
  forceFull?: boolean;
  /** null = the previous SHA is unavailable (force-push); undefined = not compared yet */
  changedFiles?: number | null;
}
export const INCREMENTAL_MAX_CHANGED = 500;

/** Plan §8.2–8.4: unchanged head => nothing to do; unknown/rewritten history or >500 changed files => full. */
export function planSync(i: PlanInput): { mode: SyncMode; reason: string } {
  if (!i.activeSha) return { mode: 'full', reason: 'first sync' };
  if (i.forceFull) return { mode: 'full', reason: 'full sync requested' };
  if (i.activeSha === i.headSha) return { mode: 'skip', reason: 'head unchanged' };
  if (i.changedFiles === null) return { mode: 'full', reason: 'previous SHA unavailable (force-push?)' };
  if (i.changedFiles !== undefined && i.changedFiles > INCREMENTAL_MAX_CHANGED) return { mode: 'full', reason: `${i.changedFiles} changed files exceeds ${INCREMENTAL_MAX_CHANGED}` };
  return { mode: 'incremental', reason: 'head moved' };
}
