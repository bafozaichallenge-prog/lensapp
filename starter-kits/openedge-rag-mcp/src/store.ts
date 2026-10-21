import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Chunk } from './abl.js';
import { tokenize, type Embedder } from './embed.js';

interface Row extends Chunk { vec: number[] }
interface Disk { embedder: string; builtAt: string; rows: Row[] }

export interface Hit { chunk: Chunk; score: number }

export class Index {
  private df = new Map<string, number>();
  private tf: Map<string, number>[] = [];
  private len: number[] = [];
  private avg = 1;

  constructor(public rows: Row[], public embedderName: string, public builtAt = new Date().toISOString()) {
    rows.forEach((r) => {
      const toks = tokenize(`${r.path} ${r.name} ${r.text}`);
      const m = new Map<string, number>();
      toks.forEach((t) => m.set(t, (m.get(t) ?? 0) + 1));
      m.forEach((_, t) => this.df.set(t, (this.df.get(t) ?? 0) + 1));
      this.tf.push(m);
      this.len.push(toks.length);
    });
    this.avg = this.len.reduce((a, b) => a + b, 0) / Math.max(1, this.len.length);
  }

  static async build(chunks: Chunk[], embedder: Embedder) {
    const vecs = await embedder.embed(chunks.map((c) => `${c.kind} ${c.name}\n${c.text}`));
    return new Index(chunks.map((c, i) => ({ ...c, vec: vecs[i] })), embedder.name);
  }

  static async load(path: string) {
    const d = JSON.parse(await readFile(path, 'utf8')) as Disk;
    return new Index(d.rows, d.embedder, d.builtAt);
  }

  async save(path: string) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify({ embedder: this.embedderName, builtAt: this.builtAt, rows: this.rows } satisfies Disk));
  }

  private bm25(query: string[]): number[] {
    const N = this.rows.length;
    return this.tf.map((m, i) => {
      let s = 0;
      for (const q of new Set(query)) {
        const f = m.get(q);
        if (!f) continue;
        const idf = Math.log(1 + (N - (this.df.get(q) ?? 0) + 0.5) / ((this.df.get(q) ?? 0) + 0.5));
        s += (idf * f * 2.2) / (f + 1.2 * (0.25 + 0.75 * (this.len[i] / this.avg)));
      }
      return s;
    });
  }

  /** Hybrid search: BM25 and vector rankings fused with reciprocal-rank fusion. */
  async search(query: string, embedder: Embedder, k = 8, filter?: (c: Chunk) => boolean): Promise<Hit[]> {
    if (embedder.name !== this.embedderName) {
      throw new Error(`Index was built with "${this.embedderName}" but the query embedder is "${embedder.name}". Re-run the index command.`);
    }
    const [qv] = await embedder.embed([query]);
    const lex = this.bm25(tokenize(query));
    const vec = this.rows.map((r) => r.vec.reduce((s, x, i) => s + x * qv[i], 0));
    const rank = (scores: number[]) => {
      const order = scores.map((s, i) => [s, i] as const).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]);
      const r = new Map<number, number>();
      order.forEach(([, i], pos) => r.set(i, pos + 1));
      return r;
    };
    const rl = rank(lex), rv = rank(vec);
    const fused = this.rows.map((_, i) => (rl.has(i) ? 1 / (60 + rl.get(i)!) : 0) + (rv.has(i) ? 1 / (60 + rv.get(i)!) : 0));
    return fused
      .map((score, i) => ({ chunk: this.rows[i] as Chunk, score }))
      .filter((h) => h.score > 0 && (!filter || filter(h.chunk)))
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map((h) => ({ chunk: stripVec(h.chunk), score: h.score }));
  }
}

function stripVec(c: Chunk): Chunk {
  const { vec: _v, ...rest } = c as Row;
  return rest;
}
