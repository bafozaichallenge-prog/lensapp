export interface Embedder {
  readonly name: string;
  embed(texts: string[]): Promise<number[][]>;
}

/** Split identifiers so `cust-order-total` and `CustOrderTotal` both yield cust/order/total. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().match(/[a-z0-9][a-z0-9\-_.]*/g) ?? []) {
    out.push(raw);
    const parts = raw.split(/[-_.]/).filter(Boolean);
    if (parts.length > 1) out.push(...parts);
  }
  for (const camel of text.match(/[a-z]+(?:[A-Z][a-z0-9]+)+/g) ?? []) {
    out.push(...camel.replace(/([A-Z])/g, ' $1').toLowerCase().split(' ').filter(Boolean));
  }
  return out;
}

function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/**
 * Offline default: signed feature hashing of tokens + bigrams into a fixed-size,
 * L2-normalised vector. Lexical, not semantic - swap in HttpEmbedder for real embeddings.
 */
export class HashingEmbedder implements Embedder {
  readonly name: string;
  constructor(private dims = 512) { this.name = `hashing-${dims}`; }
  async embed(texts: string[]) {
    return texts.map((t) => {
      const v = new Array<number>(this.dims).fill(0);
      const toks = tokenize(t);
      const add = (f: string, w: number) => { const h = fnv(f); v[h % this.dims] += (h & 0x80000000 ? -1 : 1) * w; };
      toks.forEach((tok, i) => { add(tok, 1); if (i > 0) add(`${toks[i - 1]} ${tok}`, 0.5); });
      const n = Math.hypot(...v) || 1;
      return v.map((x) => x / n);
    });
  }
}

/** Any OpenAI-compatible `POST {url}` with `{ model, input }` -> `{ data: [{ embedding }] }`. */
export class HttpEmbedder implements Embedder {
  readonly name: string;
  constructor(private url: string, private model: string, private apiKey?: string) { this.name = `http:${model}`; }
  async embed(texts: string[]) {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 64) {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) },
        body: JSON.stringify({ model: this.model, input: texts.slice(i, i + 64) }),
      });
      if (!res.ok) throw new Error(`Embeddings request failed: ${res.status} ${await res.text()}`);
      const json = (await res.json()) as { data: { embedding: number[] }[] };
      out.push(...json.data.map((d) => d.embedding));
    }
    return out;
  }
}

export function embedderFromEnv(env = process.env): Embedder {
  if (env.EMBEDDINGS_URL && env.EMBEDDINGS_MODEL) return new HttpEmbedder(env.EMBEDDINGS_URL, env.EMBEDDINGS_MODEL, env.EMBEDDINGS_API_KEY);
  return new HashingEmbedder();
}
