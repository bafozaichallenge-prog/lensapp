/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PgBoss } from 'pg-boss';
import { enqueueSync, jsonLogger } from '@lens/services';
import { db, dbReachable, dbUrl, makeEnv, type Env } from '../../../test/helpers/services';
import { PgBossQueue, createBoss, registerWorkers, QUEUES } from '../src';

const until = async (fn: () => Promise<boolean>, ms = 20_000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 200)); } return false; };

describe.skipIf(!dbReachable)('worker on pg-boss (real PostgreSQL)', () => {
  let env: Env; let boss: PgBoss; const schema = `pgboss_t${Date.now().toString(36)}`;
  const lines: string[] = [];
  beforeAll(async () => { env = await makeEnv(); boss = await createBoss(dbUrl!, schema, { max: 3 }); }, 30_000);
  afterAll(async () => {
    await boss?.stop({ graceful: false }).catch(() => undefined);
    await db!.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await env.cleanup(); await db!.$disconnect();
  });

  it('defines dead-letter queues and retry policy for every job type', () => {
    for (const q of Object.values(QUEUES)) { expect(q.retryLimit).toBeGreaterThan(0); expect(q.deadLetter).toMatch(/-dead$/); }
  });

  it('a "Sync now" goes through the queue: the worker picks it up and the snapshot is activated', async () => {
    const ctx = { ...env.ctx, queue: new PgBossQueue(boss) };
    await registerWorkers(boss, ctx, jsonLogger((l) => lines.push(l)));
    const src = await env.source();
    const { runId } = await enqueueSync(ctx, env.admin, src.id);
    const ok = await until(async () => (await db!.syncRun.findUnique({ where: { id: runId } }))!.status === 'DONE');
    expect(ok, JSON.stringify(await db!.syncRun.findUnique({ where: { id: runId } }))).toBe(true);
    expect(await db!.graphSnapshot.count({ where: { sourceId: src.id, status: 'ACTIVE' } })).toBe(1);
    // structured logs for the job, with no secrets
    expect(lines.some((l) => JSON.parse(l).msg === 'job sync finished')).toBe(true);
    expect(lines.join('\n')).not.toMatch(/glpat-|sk-ant-/);
  }, 40_000);

  it('the same job id sent twice is executed once (singleton key)', async () => {
    await boss.createQueue('dedupe-test', { policy: QUEUES.sync.policy });
    const a = await boss.send('dedupe-test', { runId: 'r1' }, { singletonKey: 'r1' });
    const b = await boss.send('dedupe-test', { runId: 'r1' }, { singletonKey: 'r1' });
    expect(a).toBeTruthy(); expect(b).toBeNull();
  });

  it('a job whose handler throws is retried and then succeeds; exhausted jobs land in the dead-letter queue', async () => {
    await boss.createQueue('flaky-dead');
    await boss.createQueue('flaky', { retryLimit: 2, retryDelay: 1, deadLetter: 'flaky-dead' });
    let attempts = 0;
    await boss.work('flaky', async () => { attempts++; if (attempts < 2) throw new Error('transient'); });
    await boss.send('flaky', { n: 1 });
    expect(await until(async () => attempts >= 2, 15_000)).toBe(true);

    await boss.createQueue('doomed-dead');
    await boss.createQueue('doomed', { retryLimit: 1, retryDelay: 1, deadLetter: 'doomed-dead' });
    await boss.work('doomed', async () => { throw new Error('always'); });
    await boss.send('doomed', { n: 2 });
    let dead: any[] = [];
    expect(await until(async () => { dead = await boss.fetch('doomed-dead'); return dead.length > 0; }, 20_000)).toBe(true);
    expect(dead[0].data).toEqual({ n: 2 });
  }, 60_000);

  it('a job in flight when the worker dies is redelivered to a new worker (restart safety)', async () => {
    const boss1 = await createBoss(dbUrl!, `${schema}_r`, { max: 3 });
    await boss1.createQueue('restart-dead');
    await boss1.createQueue('restart', { retryLimit: 3, retryDelay: 1, expireInSeconds: 2, deadLetter: 'restart-dead' });
    let started = false;
    await boss1.work('restart', async () => { started = true; await new Promise(() => undefined); }); // never finishes: the "crash"
    await boss1.send('restart', { x: 1 });
    expect(await until(async () => started, 10_000)).toBe(true);
    await boss1.stop({ graceful: false, close: false } as any);
    const boss2 = new PgBoss({ connectionString: dbUrl!, schema: `${schema}_r`, max: 3 }); await boss2.start();
    let completed = false;
    await boss2.work('restart', async () => { completed = true; });
    expect(await until(async () => completed, 30_000)).toBe(true);
    await boss2.stop({ graceful: false });
    await boss1.stop({ graceful: false }).catch(() => undefined);
    await db!.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}_r" CASCADE`);
  }, 60_000);
});
