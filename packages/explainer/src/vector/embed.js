// Embedders turn text into vectors. The offline HashEmbedder is lexical (identifier-aware bag of words),
// good enough for a demo and for tests. For production quality use HttpEmbedder with a real embedding model.

const STOP = new Set('the a an and or of to in on for with by is are be this that it as at from not no if then else end do define var variable returns return public private method class using input output'.split(' '));

export function tokenize(text) {
  const out = [];
  for (const raw of String(text).split(/[^A-Za-z0-9]+/)) {
    if (!raw) continue;
    const words = raw.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').toLowerCase().split(' ');
    for (const w of words) if (w.length > 1 && !STOP.has(w)) out.push(w.replace(/(ing|ed|es|s)$/, (m, _s, i) => (w.length - m.length >= 4 ? '' : m)));
    if (words.length > 1 && raw.length > 5) out.push(raw.toLowerCase());
  }
  return out;
}

function fnv(str, seed = 2166136261) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

export class HashEmbedder {
  constructor(dim = 512) { this.dim = dim; this.name = `hash-${dim}`; }
  async embed(texts) {
    return texts.map((t) => {
      const v = new Float32Array(this.dim), toks = tokenize(t);
      const bump = (tok, w) => { const h = fnv(tok); v[h % this.dim] += (h & 0x80000000 ? -1 : 1) * w; };
      toks.forEach((tok, i) => { bump(tok, 1); if (i) bump(toks[i - 1] + '_' + tok, 0.5); });
      let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1;
      return Array.from(v, (x) => Math.round((x / n) * 1e4) / 1e4);
    });
  }
}

/** Any OpenAI-compatible /embeddings endpoint (OpenAI, Voyage's OpenAI-compatible mode, Ollama, vLLM, LiteLLM...). */
export class HttpEmbedder {
  constructor({ url, apiKey, model, batch = 64 }) { Object.assign(this, { url, apiKey, model, batch }); this.name = model; }
  async embed(texts) {
    const out = [];
    for (let i = 0; i < texts.length; i += this.batch) {
      const res = await fetch(this.url, { method: 'POST', headers: { 'content-type': 'application/json', ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) },
        body: JSON.stringify({ model: this.model, input: texts.slice(i, i + this.batch) }) });
      if (!res.ok) throw new Error(`embeddings request failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
      const j = await res.json();
      for (const d of j.data.sort((a, b) => a.index - b.index)) out.push(d.embedding);
    }
    return out;
  }
}

export function cosine(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }

export function embedderFromEnv(env = process.env) {
  if (env.EXPLAINER_EMBED_URL) return new HttpEmbedder({ url: env.EXPLAINER_EMBED_URL, apiKey: env.EXPLAINER_EMBED_KEY, model: env.EXPLAINER_EMBED_MODEL || 'text-embedding-3-small' });
  return new HashEmbedder();
}
