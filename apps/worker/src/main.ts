import http from 'node:http';
import { PgBoss } from 'pg-boss';
import { createContext, jsonLogger } from '@lens/services';
import { PgBossQueue, createBoss, registerWorkers } from './queue';

/** Worker process entry point. Sync, analysis and pack-refinement jobs run here, never in the web process. */
async function main() {
  const env = process.env;
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const logger = jsonLogger(undefined, { service: 'lens-worker' });
  const boss: PgBoss = await createBoss(env.DATABASE_URL);
  boss.on('error', (e) => logger.log('error', 'pg-boss error', { error: e }));
  const ctx = createContext(env, new PgBossQueue(boss));
  await registerWorkers(boss, ctx, logger);
  logger.log('info', 'worker started', { ai: !!ctx.ai, encryption: !!ctx.keys });

  // liveness for the container health check
  const port = Number(env.WORKER_HEALTH_PORT ?? 3001);
  const server = http.createServer(async (req, res) => {
    if (req.url !== '/health') { res.writeHead(404).end(); return; }
    try { await ctx.db.$queryRaw`SELECT 1`; res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true })); }
    catch { res.writeHead(503, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false })); }
  }).listen(port);

  const stop = async (sig: string) => {
    logger.log('info', `received ${sig}, draining`);
    server.close();
    await boss.stop({ graceful: true, timeout: 30_000 });
    await ctx.db.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void stop('SIGTERM'));
  process.on('SIGINT', () => void stop('SIGINT'));
}
main().catch((e) => { process.stderr.write(JSON.stringify({ level: 'error', msg: 'worker crashed', error: String(e?.message ?? e) }) + '\n'); process.exit(1); });
