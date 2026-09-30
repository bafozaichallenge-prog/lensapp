import type { PrismaClient, Source } from '@prisma/client';
import type { KeyRing, Role } from '@lens/core';
import type { ArtifactStorage } from '@lens/storage';
import type { AiConfig, ModelClient } from '@lens/ai';
import type { CommitInput } from '@lens/core';
import type { CompareResult, RepoFile } from '@lens/gitlab';

export class ServiceError extends Error {
  constructor(public code: 'FORBIDDEN' | 'NOT_FOUND' | 'BAD_REQUEST' | 'CONFLICT', message: string) { super(message); this.name = 'ServiceError'; }
}
export const forbidden = (m = 'You do not have permission to do that.') => new ServiceError('FORBIDDEN', m);
export const notFound = (m = 'Not found.') => new ServiceError('NOT_FOUND', m);
export const badRequest = (m: string) => new ServiceError('BAD_REQUEST', m);

/** The signed-in user performing an action. `breakGlass` marks the optional env-enabled local admin (no GitLab account). */
export interface Actor { id: string; role: Role; breakGlass?: boolean }

/** Queue abstraction: pg-boss in production, an in-memory recorder in tests. Interfaces are ready for schedulers/webhooks. */
export interface JobQueue {
  send(name: 'sync' | 'analysis' | 'pack-refine', data: Record<string, unknown>): Promise<string | null>;
}

/** "Can this GitLab account read this project?" (plan §7.4). Implemented against the GitLab API in production. */
export interface VisibilityChecker {
  canRead(userId: string, gitlabProjectId: number): Promise<boolean>;
}

/** What the sync job needs from GitLab; matches GitLabClient so tests can substitute a fake. */
export interface GitLabLike {
  headSha(projectId: number, branch: string): Promise<string>;
  compare(projectId: number, from: string, to: string): Promise<CompareResult | null>;
  archive(projectId: number, sha: string, filters: string[]): Promise<RepoFile[]>;
  files(projectId: number, paths: string[], ref: string): Promise<RepoFile[]>;
  history(projectId: number, branch: string): Promise<CommitInput[]>;
}

export interface Ctx {
  db: PrismaClient;
  storage: ArtifactStorage;
  keys: KeyRing | null;
  queue: JobQueue;
  visibility: VisibilityChecker;
  ai: AiConfig | null;
  env: Record<string, string | undefined>;
  makeGitLab(source: Source, token: string | null): GitLabLike;
  makeModel(): ModelClient | null;
  now(): Date;
}

/** Cache lifetime for GitLab visibility answers. */
export const VISIBILITY_TTL_MS = 10 * 60 * 1000;
