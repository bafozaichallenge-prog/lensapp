import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

export interface StoredArtifact { key: string; sha256: string; size: number }

/**
 * Where file contents, uploaded documents and generated pack artefacts live (plan §6). The domain model only
 * holds `key`s, so moving from the database to S3-compatible object storage needs a new implementation of
 * this interface plus a data copy, never a schema change.
 */
export interface ArtifactStorage {
  readonly kind: string;
  put(bytes: Uint8Array): Promise<StoredArtifact>;
  get(key: string): Promise<Uint8Array | null>;
  has(key: string): Promise<boolean>;
  /** Optional batched read; callers fall back to get() per key when an implementation does not provide it. */
  getMany?(keys: string[]): Promise<Map<string, Uint8Array>>;
}

export const sha256Hex = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');

export class MemoryStorage implements ArtifactStorage {
  readonly kind = 'memory';
  private m = new Map<string, Uint8Array>();
  async put(bytes: Uint8Array) { const key = sha256Hex(bytes); this.m.set(key, bytes); return { key, sha256: key, size: bytes.byteLength }; }
  async get(key: string) { return this.m.get(key) ?? null; }
  async has(key: string) { return this.m.has(key); }
  async getMany(keys: string[]) { return new Map(keys.flatMap((k) => (this.m.has(k) ? [[k, this.m.get(k)!] as [string, Uint8Array]] : []))); }
  get size() { return this.m.size; }
}

/** First implementation: content-addressed rows in PostgreSQL, deduplicated by SHA-256. */
export class DatabaseStorage implements ArtifactStorage {
  readonly kind = 'database';
  constructor(private db: Pick<PrismaClient, 'blob'>) {}
  async put(bytes: Uint8Array) {
    const key = sha256Hex(bytes);
    await this.db.blob.upsert({ where: { sha256: key }, create: { sha256: key, size: bytes.byteLength, storage: 'database', data: Buffer.from(bytes) }, update: {} });
    return { key, sha256: key, size: bytes.byteLength };
  }
  async get(key: string) {
    const b = await this.db.blob.findUnique({ where: { sha256: key } });
    return b?.data ? new Uint8Array(b.data) : null;
  }
  async has(key: string) { return (await this.db.blob.count({ where: { sha256: key } })) > 0; }
  async getMany(keys: string[]) {
    const out = new Map<string, Uint8Array>();
    for (let i = 0; i < keys.length; i += 200) {
      const rows = await this.db.blob.findMany({ where: { sha256: { in: keys.slice(i, i + 200) } }, select: { sha256: true, data: true } });
      for (const r of rows) if (r.data) out.set(r.sha256, new Uint8Array(r.data));
    }
    return out;
  }
}
