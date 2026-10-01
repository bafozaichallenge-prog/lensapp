import { createHash } from 'node:crypto';
import { normalizeSpec } from './spec.js';
import { renderHtml } from './render.js';
import { SYSTEM_PROMPT, buildUserMessage, redact } from './prompt.js';

export class ExplainerError extends Error {
  constructor(message, { code = 'error', status = 400, details } = {}) { super(message); Object.assign(this, { code, status, details }); }
}

const MAX_PROMPT = 4000, MAX_CONTEXT = 20000;
const flatten = (o) => (o == null ? '' : typeof o === 'object' ? Object.values(o).map(flatten).join(' ') : String(o));

/** Cap chunks per file so one big file cannot crowd out the rest. */
function diversify(hits, k, perFile = 3) {
  const seen = new Map(), out = [];
  for (const h of hits) { const n = seen.get(h.meta.path) || 0; if (n < perFile) { out.push(h); seen.set(h.meta.path, n + 1); } if (out.length >= k) break; }
  return out;
}

/** Remove source citations that point at nothing the model was actually given. */
export function groundSources(spec, allowedPaths, processIds) {
  const removed = [];
  for (const s of spec.steps) {
    s.sources = s.sources.filter((src) => {
      const ok = src.kind === 'code' ? allowedPaths.has(src.ref) : src.kind === 'process' ? processIds.has(src.ref) : true;
      if (!ok) removed.push(`step ${s.n}: ${src.kind} "${src.ref}"`);
      return ok;
    });
  }
  return removed;
}

export class Explainer {
  /** @param {{store, embedder, catalog, provider, cacheTtlMs?: number, topK?: number}} deps */
  constructor(deps) { Object.assign(this, { topK: 12, cacheTtlMs: 10 * 60 * 1000 }, deps); this.cache = new Map(); }

  async retrieve(query, kinds = ['code', 'doc']) {
    const [vec] = await this.embedder.embed([query]);
    return diversify(await this.store.query(vec, { k: this.topK * 3, kinds }), this.topK);
  }

  /**
   * @param {{prompt:string, processId?:string, context?:object, theme?:string, header?:boolean, noCache?:boolean}} req
   * @param {(event:{type:string, [k:string]:any})=>void} [emit]
   */
  async explain(req, emit = () => {}, signal) {
    const prompt = typeof req.prompt === 'string' ? req.prompt.trim() : '';
    if (prompt.length < 3) throw new ExplainerError('Describe the process to explain (at least a few words).', { code: 'bad_prompt' });
    if (prompt.length > MAX_PROMPT) throw new ExplainerError(`The request is too long (max ${MAX_PROMPT} characters).`, { code: 'bad_prompt' });
    const hostContext = req.context && typeof req.context === 'object' ? req.context : undefined;
    if (hostContext && JSON.stringify(hostContext).length > MAX_CONTEXT) throw new ExplainerError(`The context is too large (max ${MAX_CONTEXT} characters).`, { code: 'bad_context' });
    if (req.processId && !this.catalog.get(req.processId)) throw new ExplainerError(`Unknown process "${req.processId}".`, { code: 'unknown_process', status: 404 });

    const t0 = Date.now();
    const key = createHash('sha256').update(JSON.stringify([prompt, req.processId || '', hostContext || '', this.provider.name, this.provider.model, await this.store.count()])).digest('hex');
    const hit = this.cache.get(key);
    if (!req.noCache && hit && hit.at > Date.now() - this.cacheTtlMs) { emit({ type: 'stage', stage: 'cache', message: 'Reusing a recent result' }); return this.finish(hit.result, req, true); }

    emit({ type: 'stage', stage: 'retrieve', message: 'Reading the indexed code and processes' });
    const query = `${prompt}\n${flatten(hostContext)}`.slice(0, 4000);
    const matches = req.processId ? [{ process: this.catalog.get(req.processId), score: 1 }] : await this.catalog.match(query, { max: 1 });
    const processes = matches.map((m) => m.process);
    const chunks = await this.retrieve(`${query}\n${processes.map((p) => p.name).join(' ')}`);
    const { text, chunksUsed } = buildUserMessage({ prompt, hostContext, processes, chunks });
    emit({ type: 'retrieval', processes: matches.map((m) => ({ id: m.process.id, score: +m.score.toFixed(3) })), chunks: chunks.slice(0, chunksUsed).map((c) => ({ path: c.meta.path, startLine: c.meta.startLine, endLine: c.meta.endLine, score: +c.score.toFixed(3) })) });

    const messages = [{ role: 'user', content: text }];
    const context = { process: processes[0], prompt, hostContext, chunks };
    const allowedPaths = new Set([...chunks.map((c) => c.meta.path), ...processes.flatMap((p) => p.steps.flatMap((s) => s.refs || []))]);
    const processIds = new Set(processes.map((p) => p.id));

    emit({ type: 'stage', stage: 'generate', message: this.provider.name === 'offline' ? 'Replaying the process (no AI)' : 'Writing the explainer' });
    let out = await this.provider.generate({ system: SYSTEM_PROMPT, messages, context, signal, onProgress: (chars) => emit({ type: 'progress', chars }) });
    emit({ type: 'stage', stage: 'validate', message: 'Checking the structure' });
    let norm = normalizeSpec(out.raw), repaired = false;
    if (!norm.ok && this.provider.name !== 'offline') {
      emit({ type: 'stage', stage: 'repair', message: 'Fixing problems in the first draft' });
      repaired = true;
      const retry = await this.provider.generate({ system: SYSTEM_PROMPT, signal, context, onProgress: (chars) => emit({ type: 'progress', chars }),
        messages: [...messages, { role: 'assistant', content: JSON.stringify(out.raw) },
          { role: 'user', content: `That draft failed validation:\n${norm.errors.slice(0, 12).map((e) => `- ${e}`).join('\n')}\nReturn the complete corrected explainer.` }] });
      out = { ...retry, usage: { input: (out.usage.input || 0) + (retry.usage.input || 0), output: (out.usage.output || 0) + (retry.usage.output || 0) } };
      norm = normalizeSpec(retry.raw);
    }
    if (!norm.ok) throw new ExplainerError(`The generated explainer was not valid: ${norm.errors.slice(0, 3).join('; ')}`, { code: 'invalid_output', status: 502, details: norm.errors });

    const ungrounded = groundSources(norm.spec, allowedPaths, processIds);
    const result = {
      spec: norm.spec,
      meta: {
        provider: this.provider.name, model: out.model, ai: this.provider.name !== 'offline', usage: out.usage, repaired,
        durationMs: Date.now() - t0, warnings: norm.warnings, groundingRemoved: ungrounded,
        retrieval: { processes: matches.map((m) => m.process.id), chunks: chunksUsed },
        promptSha: createHash('sha256').update(redact(prompt)).digest('hex').slice(0, 12),
      },
    };
    this.cache.set(key, { at: Date.now(), result });
    if (this.cache.size > 50) this.cache.delete(this.cache.keys().next().value);
    return this.finish(result, req, false);
  }

  finish(result, req, cached) {
    return { spec: result.spec, html: renderHtml(result.spec, { theme: req.theme, header: req.header }), meta: { ...result.meta, cached } };
  }
}
