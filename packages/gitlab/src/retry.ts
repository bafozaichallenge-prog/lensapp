export class GitLabHttpError extends Error {
  constructor(public status: number, message: string, public retryAfterSec?: number) { super(message); this.name = 'GitLabHttpError'; }
}

export interface RetryOptions {
  maxRetries?: number;          // plan §8.6: 5
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** 429 honours Retry-After; 5xx and network errors back off exponentially; 4xx (other than 429) fail fast. */
export async function withRetry<T>(fn: () => Promise<T>, o: RetryOptions = {}): Promise<T> {
  const max = o.maxRetries ?? 5, base = o.baseDelayMs ?? 500, sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt++) {
    try { return await fn(); }
    catch (e) {
      const err = e as GitLabHttpError;
      const status = err instanceof GitLabHttpError ? err.status : 0; // 0 = network failure
      const retryable = status === 429 || status >= 500 || status === 0;
      if (!retryable || attempt >= max) throw e;
      const wait = status === 429 && err.retryAfterSec != null ? err.retryAfterSec * 1000 : Math.min(base * 2 ** attempt, 30_000);
      await sleep(wait);
    }
  }
}

/** Run tasks with a concurrency cap (plan §8.6: 4 concurrent file requests per source). */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) { const i = next++; if (i >= items.length) return; out[i] = await fn(items[i]!, i); }
  }));
  return out;
}
