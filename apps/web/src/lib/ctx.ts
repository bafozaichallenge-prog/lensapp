import 'server-only';
import { PrismaClient } from '@prisma/client';
import { createContext, type Ctx, type JobQueue } from '@lens/services';
import { PgBossQueue, createBoss } from '@lens/queue';
import type { PgBoss } from 'pg-boss';

// One PrismaClient / queue per server process (survives dev hot reloads).
const g = globalThis as unknown as { __lens?: { db: PrismaClient; ctx?: Ctx; boss?: Promise<PgBoss> } };
g.__lens ??= { db: new PrismaClient() };

/** Send-only pg-boss connection (no supervision or scheduling: the worker owns those). */
function queue(): JobQueue {
  return {
    async send(name, data) {
      g.__lens!.boss ??= createBoss(process.env.DATABASE_URL!, 'pgboss', { supervise: false, schedule: false });
      return new PgBossQueue(await g.__lens!.boss).send(name, data);
    },
  };
}

export const db = g.__lens.db;
export function getCtx(): Ctx {
  g.__lens!.ctx ??= createContext(process.env, queue(), g.__lens!.db);
  return g.__lens!.ctx;
}
