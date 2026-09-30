import { PrismaClient } from '@prisma/client';
import { keyRingFromEnv } from '@lens/core';
import { DatabaseStorage } from '@lens/storage';
import { GitLabClient } from '@lens/gitlab';
import { AnthropicClient, aiConfigFromEnv } from '@lens/ai';
import type { Ctx, JobQueue } from './context';
import { GitlabVisibility } from './gitlab-visibility';

/** Build the runtime context from environment variables. Shared by the web app and the worker. */
export function createContext(env: Record<string, string | undefined>, queue: JobQueue, db: PrismaClient = new PrismaClient()): Ctx {
  const baseUrl = env.GITLAB_BASE_URL ?? 'https://gitlab.com';
  let keys: Ctx['keys'] = null;
  if (env.LENS_ENCRYPTION_KEYS || env.LENS_ENCRYPTION_KEY) keys = keyRingFromEnv(env);
  const ai = aiConfigFromEnv(env);
  return {
    db, storage: new DatabaseStorage(db), keys, queue, env, ai,
    visibility: new GitlabVisibility(db, { baseUrl, clientId: env.GITLAB_CLIENT_ID, clientSecret: env.GITLAB_CLIENT_SECRET }),
    makeGitLab: (_source, token) => new GitLabClient({ baseUrl, token: token ?? '' }),
    makeModel: () => (ai ? new AnthropicClient(ai) : null),
    now: () => new Date(),
  };
}
