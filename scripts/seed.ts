/* eslint-disable @typescript-eslint/no-explicit-any */
// Demo / development seed (plan §29). Idempotent. Needs no GitLab: it loads the bundled BafozAIChallenge sample repository
// as a source, imports its tickets and incidents, and creates the worked example marked "Example / Seed data".
//   npm run seed          (development)
//   LENS_SEED_DEMO=1 ...  (required to run when NODE_ENV=production, e.g. the compose "demo" profile)
import fs from 'node:fs';
import path from 'node:path';
import { impactIn } from '@lens/impact';
import { decodeSource, parseGitLog, parseSource } from '@lens/ingest';
import { saveAndActivateSnapshot } from '@lens/storage';
import { AnalysisSchema, normalizeAnalysis } from '@lens/ai';
import { BREAK_GLASS_EMAIL, createContext, loadModel, runImport, type Actor, type Ctx } from '@lens/services';
import { PrismaClient } from '@prisma/client';

const ROOT = process.env.LENS_FIXTURE_DIR ?? path.resolve(__dirname, '../test/fixtures');
const SOURCE_NAME = 'Demo: New Business (sample repository)';

const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.LENS_SEED_DEMO !== '1') throw new Error('Refusing to seed demo data in production without LENS_SEED_DEMO=1');
  const db = new PrismaClient();
  const ctx: Ctx = createContext(process.env, { send: async () => null }, db);
  // the seed acts as the local break-glass admin so it can see the (GitLab-less) demo source
  const user = await db.user.upsert({ where: { email: BREAK_GLASS_EMAIL }, create: { email: BREAK_GLASS_EMAIL, name: 'Break-glass admin', role: 'ADMIN' }, update: {} });
  const actor: Actor = { id: user.id, role: 'ADMIN', breakGlass: true };

  const repo = path.join(ROOT, 'bafoz');
  const files = walk(repo).map((f) => ({ path: path.relative(repo, f).split(path.sep).join('/'), text: decodeSource(fs.readFileSync(f)) }));
  const find = (s: string) => files.find((f) => f.path.endsWith(s))!;
  const commits = parseGitLog(find('history.gitlog').text);
  const source = files.filter((f) => !f.path.startsWith('exports/'));

  let src = await db.source.findFirst({ where: { name: SOURCE_NAME } });
  if (!src) src = await db.source.create({ data: { name: SOURCE_NAME, vertical: 'Personal Insurance', gitlabProjectId: 0, pathWithNamespace: 'demo/bafoz-sample', branch: 'demo' } });
  const head = commits[commits.length - 1]!.sha;
  if (!(await db.graphSnapshot.findFirst({ where: { sourceId: src.id, status: 'ACTIVE', sha: head } }))) {
    const graph = await parseSource(source, commits);
    const r = await saveAndActivateSnapshot(db, ctx.storage, { sourceId: src.id, sha: head, graph, files: source, commits });
    if (!r.ok) throw new Error(`Snapshot failed: ${r.issues.join('; ')}`);
    console.log(`Demo snapshot ${r.snapshotId} active (${graph.files.length} files, ${graph.edges.length} relationships)`);
  }
  await runImport(ctx, actor, src.id, 'tickets', find('jira-taskmanager-tickets.csv').text, { key: 'id', title: 'title', taskmanager: 'tm', type: 'type', status: 'status', note: 'tm_note', reqs: 'reqs', commit: 'commit' });
  await runImport(ctx, actor, src.id, 'incidents', find('incidents.csv').text, { key: 'id', title: 'title', files: 'files', severity: 'sev', rootCause: 'root', reqs: 'reqs', fixTicket: 'fix', status: 'status', residual: 'residual', symptom: 'symptom', date: 'date' });

  // the worked example: "Last-day debit order collections", clearly marked and removable
  const exists = await db.changeProject.findFirst({ where: { sourceId: src.id, isExample: true } });
  if (!exists) {
    const example = JSON.parse(fs.readFileSync(path.join(ROOT, 'example-last-day-debit-orders.json'), 'utf8'));
    const { request, stages, new_stages: newStages, ...rest } = example;
    const parsed = AnalysisSchema.parse({ ...rest, processes: [{ process: 'New Business Process', stages: stages ?? [], new_stages: newStages ?? [] }] });
    const m = await loadModel(ctx, src.id);
    const result = normalizeAnalysis(parsed, m.view.processes);
    const project = await db.changeProject.create({ data: { name: 'Last-day debit order collections', description: request, sourceId: src.id, sourceSelection: 'MANUAL', status: 'ANALYSED', isExample: true, createdBy: user.id } });
    await db.analysis.create({
      data: {
        changeProjectId: project.id, version: 1, status: 'DONE', sourceId: src.id, graphSnapshotId: m.snapshot.id, sha: m.snapshot.sha, inputDocumentVersionIds: [],
        impactJson: { impact: impactIn(m.view, request), aiStatus: 'seeded' } as any, provider: 'seed', model: 'prototype-example', promptVersion: 'seed', outputSchemaVersion: 1, resultJson: result as any,
        tasks: { create: result.tasks.map((t) => ({ key: t.id, system: t.system, type: t.type, title: t.title, description: t.description, acceptance: t.acceptance, files: t.files, step: t.step ?? null, owner: t.owner, priority: t.priority, dependsOn: t.depends_on })) },
      },
    });
    console.log('Example project created (marked "Example / Seed data")');
  }
  await db.$disconnect();
  console.log('Seed complete. Sign in with the break-glass admin (see README), or with GitLab if configured.');
}
main().catch((e) => { console.error(e); process.exit(1); });
