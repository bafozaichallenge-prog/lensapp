// VectorStore interface (all methods async):
//   upsert(chunks: {id, vector, meta}[])     meta = {kind:'code'|'doc', path, startLine, endLine, text}
//   query(vector, {k, kinds?}) -> {score, meta}[]
//   clear() / count()
// MemoryVectorStore persists to a JSON file; QdrantStore talks to Qdrant's REST API. Both obey the same contract.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { cosine } from './embed.js';

export class MemoryVectorStore {
  constructor({ file } = {}) { this.file = file; this.items = new Map(); this.embedder = null; if (file && existsSync(file)) this.load(); }
  load() { const j = JSON.parse(readFileSync(this.file, 'utf8')); this.embedder = j.embedder; this.items = new Map(j.items.map((x) => [x.id, x])); }
  save() { if (!this.file) return; mkdirSync(dirname(this.file), { recursive: true }); writeFileSync(this.file, JSON.stringify({ embedder: this.embedder, items: [...this.items.values()] })); }
  async upsert(chunks, embedderName) { this.embedder = embedderName ?? this.embedder; for (const c of chunks) this.items.set(c.id, c); this.save(); }
  async clear() { this.items.clear(); this.save(); }
  async count() { return this.items.size; }
  async query(vector, { k = 8, kinds } = {}) {
    const out = [];
    for (const it of this.items.values()) { if (kinds && !kinds.includes(it.meta.kind)) continue; out.push({ score: cosine(vector, it.vector), meta: it.meta }); }
    return out.sort((a, b) => b.score - a.score).slice(0, k);
  }
}

const uuidOf = (s) => { const h = createHash('sha1').update(s).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; };

export class QdrantStore {
  constructor({ url, collection = 'explainer', apiKey }) { Object.assign(this, { url: url.replace(/\/$/, ''), collection, apiKey }); this.ready = false; }
  async req(method, path, body) {
    const res = await fetch(this.url + path, { method, headers: { 'content-type': 'application/json', ...(this.apiKey ? { 'api-key': this.apiKey } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) throw new Error(`qdrant ${method} ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }
  async ensure(dim) {
    if (this.ready) return;
    const r = await fetch(`${this.url}/collections/${this.collection}`, { headers: this.apiKey ? { 'api-key': this.apiKey } : {} });
    if (r.status === 404) await this.req('PUT', `/collections/${this.collection}`, { vectors: { size: dim, distance: 'Cosine' } });
    this.ready = true;
  }
  async upsert(chunks) {
    if (!chunks.length) return;
    await this.ensure(chunks[0].vector.length);
    for (let i = 0; i < chunks.length; i += 100)
      await this.req('PUT', `/collections/${this.collection}/points?wait=true`, { points: chunks.slice(i, i + 100).map((c) => ({ id: uuidOf(c.id), vector: c.vector, payload: c.meta })) });
  }
  async clear() { await fetch(`${this.url}/collections/${this.collection}`, { method: 'DELETE', headers: this.apiKey ? { 'api-key': this.apiKey } : {} }); this.ready = false; }
  async count() { try { return (await this.req('POST', `/collections/${this.collection}/points/count`, { exact: false })).result.count; } catch { return 0; } }
  async query(vector, { k = 8, kinds } = {}) {
    const body = { vector, limit: k, with_payload: true, ...(kinds ? { filter: { must: [{ key: 'kind', match: { any: kinds } }] } } : {}) };
    const j = await this.req('POST', `/collections/${this.collection}/points/search`, body);
    return j.result.map((p) => ({ score: p.score, meta: p.payload }));
  }
}

export function storeFromEnv(env = process.env, dataDir = '.data') {
  if (env.EXPLAINER_QDRANT_URL) return new QdrantStore({ url: env.EXPLAINER_QDRANT_URL, collection: env.EXPLAINER_QDRANT_COLLECTION || 'explainer', apiKey: env.EXPLAINER_QDRANT_KEY });
  return new MemoryVectorStore({ file: env.EXPLAINER_INDEX_FILE || `${dataDir}/index.json` });
}
