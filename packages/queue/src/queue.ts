import { PgBoss } from 'pg-boss';
import type { Ctx, JobQueue, Logger } from '@lens/services';
import { runSyncJob, runAnalysisJob, runPackRefineJob } from '@lens/services';

export const QUEUES = {
  sync: { policy: 'short', retryLimit: 3, retryDelay: 30, retryBackoff: true, expireInSeconds: 60 * 60, deadLetter: 'sync-dead' },
  analysis: { policy: 'short', retryLimit: 2, retryDelay: 30, retryBackoff: true, expireInSeconds: 30 * 60, deadLetter: 'analysis-dead' },
  'pack-refine': { policy: 'short', retryLimit: 1, retryDelay: 15, retryBackoff: true, expireInSeconds: 10 * 60, deadLetter: 'pack-refine-dead' },
} as const;
export type QueueName = keyof typeof QUEUES;

/** JobQueue backed by pg-boss on the same PostgreSQL instance. The `short` policy keeps at most one queued job per singleton key (run/analysis id). */
export class PgBossQueue implements JobQueue {
  constructor(private boss: PgBoss) {}
  send(name: QueueName, data: Record<string, unknown>) {
    const singletonKey = String(data.runId ?? data.analysisId ?? data.jobId ?? '') || undefined;
    return this.boss.send(name, data, { singletonKey });
  }
}

export async function createBoss(connectionString: string, schema = 'pgboss', opts: { supervise?: boolean; schedule?: boolean } = {}): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString, schema, ...opts });
  await boss.start();
  for (const dead of Object.values(QUEUES).map((q) => q.deadLetter)) await boss.createQueue(dead);
  for (const [name, o] of Object.entries(QUEUES)) await boss.createQueue(name, o);
  return boss;
}

/**
 * Register the job handlers. Handlers are idempotent (see services), so redelivery after a worker crash resumes the
 * work instead of duplicating it. A thrown error makes pg-boss retry with backoff; exhausted jobs go to a dead-letter queue.
 */
export async function registerWorkers(boss: PgBoss, ctx: Ctx, logger: Logger, concurrency = { sync: 2, analysis: 2, 'pack-refine': 1 }) {
  const wrap = <T,>(name: QueueName, fn: (d: T) => Promise<void>) => async (jobs: { id: string; data: unknown }[]) => {
    for (const j of jobs) {
      const t0 = Date.now();
      logger.log('info', `job ${name} started`, { jobId: j.id });
      try { await fn(j.data as T); logger.log('info', `job ${name} finished`, { jobId: j.id, ms: Date.now() - t0 }); }
      catch (e) { logger.log('error', `job ${name} failed`, { jobId: j.id, error: e }); throw e; }
    }
  };
  await boss.work(('sync'), { localConcurrency: concurrency.sync }, wrap<{ runId: string }>('sync', (d) => runSyncJob(ctx, d.runId)));
  await boss.work('analysis', { localConcurrency: concurrency.analysis }, wrap<{ analysisId: string }>('analysis', (d) => runAnalysisJob(ctx, d.analysisId)));
  await boss.work('pack-refine', { localConcurrency: concurrency['pack-refine'] }, wrap<{ sourceId: string; processName: string; userId: string }>('pack-refine', (d) => runPackRefineJob(ctx, d)));
}
