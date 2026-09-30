/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import AdmZip from 'adm-zip';
import type { CommitInput, Role, SourceFile } from '@lens/core';
import { DatabaseStorage } from '@lens/storage';
import type { ModelClient, ModelResponse } from '@lens/ai';
import { asV2Example } from './example';
import { loadFixture } from './fixture';
import { clearModelCache, type Actor, type Ctx, type GitLabLike, type JobQueue, type VisibilityChecker } from '@lens/services';

export const dbUrl = process.env.DATABASE_URL;
export const db = dbUrl ? new PrismaClient({ datasources: { db: { url: dbUrl } } }) : null;
export const dbReachable = db ? await db.$queryRaw`SELECT 1`.then(() => true, () => false) : false;

/** A mutable fake GitLab project backed by the fixture repository. */
export class FakeGitLab implements GitLabLike {
  repo: Map<string, string>;
  head = 'aaaaaaa1';
  commits: CommitInput[];
  calls = { archive: 0, files: 0, compare: 0, history: 0 };
  failNext: Error | null = null;
  forgetSha = false;
  lastToken: string | null = null;
  private snapshots = new Map<string, Map<string, string>>();
  constructor(src: SourceFile[], commits: CommitInput[]) {
    this.repo = new Map(src.map((f) => [f.path, f.text]));
    this.commits = commits;
    this.snapshots.set(this.head, new Map(this.repo));
  }
  advance(sha: string, edit: (files: Map<string, string>) => void) { edit(this.repo); this.head = sha; this.snapshots.set(sha, new Map(this.repo)); }
  private maybeFail() { if (this.failNext) { const e = this.failNext; this.failNext = null; throw e; } }
  async headSha() { this.maybeFail(); return this.head; }
  async compare(_p: number, from: string, to: string) {
    this.calls.compare++;
    const a = this.snapshots.get(from), b = this.snapshots.get(to);
    if (!a || !b || this.forgetSha) return null;
    const diffs: any[] = [];
    for (const [p, t] of b) { if (!a.has(p)) diffs.push({ new_path: p, old_path: p, new_file: true, deleted_file: false, renamed_file: false }); else if (a.get(p) !== t) diffs.push({ new_path: p, old_path: p, new_file: false, deleted_file: false, renamed_file: false }); }
    for (const p of a.keys()) if (!b.has(p)) diffs.push({ new_path: p, old_path: p, new_file: false, deleted_file: true, renamed_file: false });
    return { commits: [], diffs };
  }
  async archive() { this.calls.archive++; return [...this.repo].map(([path, t]) => ({ path, bytes: new TextEncoder().encode(t) })); }
  async files(_p: number, paths: string[]) { this.calls.files++; return paths.map((p) => ({ path: p, bytes: new TextEncoder().encode(this.repo.get(p) ?? '') })); }
  async history() { this.calls.history++; return this.commits; }
}
export class Recorder implements JobQueue {
  sent: { name: string; data: any }[] = [];
  async send(name: any, data: any) { this.sent.push({ name, data }); return `job-${this.sent.length}`; }
}

/** Visibility: which user ids may read which GitLab project ids. */
export class FakeVisibility implements VisibilityChecker {
  allow = new Map<string, Set<number>>();
  calls = 0;
  throwNext = false;
  grant(userId: string, ...projects: number[]) { this.allow.set(userId, new Set([...(this.allow.get(userId) ?? []), ...projects])); }
  revoke(userId: string) { this.allow.delete(userId); }
  async canRead(userId: string, projectId: number) { this.calls++; if (this.throwNext) { this.throwNext = false; throw new Error('gitlab down'); } return this.allow.get(userId)?.has(projectId) ?? false; }
}

export function scriptedModel(steps: (() => ModelResponse)[]): ModelClient & { calls: any[] } {
  const calls: any[] = [];
  return { provider: 'test', model: 'scripted', calls, async complete(r) { calls.push(structuredClone({ ...r, signal: undefined })); const s = steps[calls.length - 1]; if (!s) throw new Error('script exhausted'); return s(); } };
}
export const modelText = (t: string): ModelResponse => ({ content: [{ type: 'text', text: t }], stopReason: 'end_turn', usage: { inputTokens: 100, outputTokens: 50 } });
export const modelTool = (id: string, name: string, input: any): ModelResponse => ({ content: [{ type: 'tool_use', id, name, input }], stopReason: 'tool_use', usage: { inputTokens: 100, outputTokens: 10 } });
export const exampleAnalysisJson = () => JSON.stringify(asV2Example());

export interface Env {
  ctx: Ctx; queue: Recorder; vis: FakeVisibility; gl: FakeGitLab; fx: Awaited<ReturnType<typeof loadFixture>>; tag: string;
  model: { current: ModelClient | null };
  user(role: Role, opts?: { gitlab?: boolean }): Promise<Actor>;
  source(over?: Partial<{ name: string; token: string; aiAllowed: boolean }>): Promise<{ id: string; gitlabProjectId: number }>;
  admin: Actor;
  cleanup(): Promise<void>;
  syncNow(sourceId: string, actor?: Actor, full?: boolean): Promise<string>;
}

let seq = 0;
let seqProject = 0;
export async function makeEnv(extraEnv: Record<string, string | undefined> = {}): Promise<Env> {
  const fx = await loadFixture();
  const tag = `svc${Date.now().toString(36)}${(seq++).toString(36)}`;
  const queue = new Recorder(), vis = new FakeVisibility(), gl = new FakeGitLab(fx.source, fx.commits);
  const model = { current: null as ModelClient | null };
  const ring = { currentId: 'k1', keys: { k1: randomBytes(32) } };
  const ctx: Ctx = {
    db: db!, storage: new DatabaseStorage(db!), keys: ring, queue, visibility: vis,
    ai: null, env: { NODE_ENV: 'test', ...extraEnv },
    makeGitLab: (_s, token) => { gl.lastToken = token; return gl as unknown as GitLabLike; },
    makeModel: () => model.current, now: () => new Date(),
  };
  const users: string[] = [];
  const glUsers: string[] = [];
  const projects: number[] = [];
  // random per environment: test files run in parallel workers that each start their counters from zero
  const base = 10_000_000 + Math.floor(Math.random() * 1_000_000) * 100 + (++seqProject) % 100 * 0;
  const env: Env = {
    ctx, queue, vis, gl, fx, tag, model, admin: undefined as unknown as Actor,
    async user(role, opts = {}) {
      const u = await db!.user.create({ data: { email: `${tag}-${users.length}-${role.toLowerCase()}@example.test`, role } });
      users.push(u.id);
      if (opts.gitlab !== false) { glUsers.push(u.id); vis.grant(u.id, ...projects); }
      return { id: u.id, role };
    },
    async source(over = {}) {
      const gid = base + projects.length;
      projects.push(gid);
      for (const id of glUsers) vis.grant(id, gid);
      const s = await db!.source.create({ data: { name: over.name ?? `${tag}-src`, vertical: 'Personal Insurance', gitlabProjectId: gid, pathWithNamespace: `mip/${tag}-${gid}`, branch: 'main', aiAllowed: over.aiAllowed ?? false, tokenEnc: over.token ? (await import('@lens/core')).encrypt(over.token, ring) : null } });
      return { id: s.id, gitlabProjectId: gid };
    },
    async syncNow(sourceId, actor, full) {
      const { runSyncJob, enqueueSync } = await import('@lens/services');
      const r = await enqueueSync(ctx, actor ?? env.admin, sourceId, { full });
      await runSyncJob(ctx, r.runId);
      return r.runId;
    },
    async cleanup() {
      await db!.changeProject.deleteMany({ where: { source: { name: { startsWith: tag } } } });
      await db!.source.deleteMany({ where: { name: { startsWith: tag } } });
      await db!.auditLog.deleteMany({ where: { userId: { in: users } } });
      await db!.user.deleteMany({ where: { id: { in: users } } });
      clearModelCache();
    },
  };
  env.admin = await env.user('ADMIN');
  return env;
}

/** A minimal but valid .docx containing the given paragraphs. */
export function makeDocx(paragraphs: string[]): Uint8Array {
  const z = new AdmZip();
  z.addFile('[Content_Types].xml', Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'));
  z.addFile('_rels/.rels', Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'));
  z.addFile('word/document.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`));
  return new Uint8Array(z.toBuffer());
}
void fs; void path;
