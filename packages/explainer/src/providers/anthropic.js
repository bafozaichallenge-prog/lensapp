// Calls Claude through the official SDK (@anthropic-ai/sdk), streaming, with structured outputs so the reply is schema-shaped JSON.
// Degrades in this order if the API rejects a request shape: drop server-side fallbacks, then drop the JSON schema.
import { OUTPUT_SCHEMA, fromModelShape } from '../json-schema.js';

export class AnthropicProvider {
  constructor({ apiKey, model = 'claude-opus-5-5', effort = 'medium', maxTokens = 32000, baseURL, fallbacks = true, client } = {}) {
    Object.assign(this, { apiKey, model, effort, maxTokens, baseURL, fallbacks, _client: client });
    this.name = 'anthropic';
  }
  async client() {
    if (this._client) return this._client;
    let mod;
    try { mod = await import('@anthropic-ai/sdk'); } catch { throw Object.assign(new Error('The AI provider needs the @anthropic-ai/sdk package. Run: npm install @anthropic-ai/sdk'), { code: 'sdk_missing' }); }
    const Anthropic = mod.default ?? mod.Anthropic;
    return (this._client = new Anthropic({ apiKey: this.apiKey, ...(this.baseURL ? { baseURL: this.baseURL } : {}) }));
  }

  /** @returns {Promise<{raw:object, usage:object, model:string}>} raw is in the stored-spec shape (not yet validated). */
  async generate({ system, messages, onProgress, signal }) {
    const client = await this.client();
    const attempts = [{ fallbacks: this.fallbacks, schema: true }, ...(this.fallbacks ? [{ fallbacks: false, schema: true }] : []), { fallbacks: false, schema: false }];
    let lastErr;
    for (const a of attempts) {
      try { return await this.once(client, a, { system, messages, onProgress, signal }); }
      catch (e) { lastErr = e; if (e?.status !== 400 || signal?.aborted) throw e; }
    }
    throw lastErr;
  }

  async once(client, a, { system, messages, onProgress, signal }) {
    const sys = a.schema ? system : `${system}\n\nReply with ONLY one JSON object that follows this JSON Schema, no prose:\n${JSON.stringify(OUTPUT_SCHEMA)}`;
    const params = {
      model: this.model, max_tokens: this.maxTokens, system: sys, messages,
      output_config: { effort: this.effort, ...(a.schema ? { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } } : {}) },
    };
    const api = a.fallbacks ? client.beta.messages : client.messages;
    if (a.fallbacks) { params.betas = ['server-side-fallback-2026-07-01']; params.fallbacks = 'default'; }
    const stream = api.stream(params, { signal });
    let text = '';
    for await (const ev of stream) {
      if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') { text += ev.delta.text; onProgress?.(text.length); }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') throw Object.assign(new Error('The model declined this request.'), { code: 'refusal' });
    if (final.stop_reason === 'max_tokens') throw Object.assign(new Error('The explainer was too long for the output limit. Ask for fewer steps.'), { code: 'too_long' });
    const body = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    let json;
    try { json = JSON.parse(body); } catch { throw Object.assign(new Error('The model did not return valid JSON.'), { code: 'bad_json' }); }
    return { raw: fromModelShape(json), usage: { input: final.usage?.input_tokens, output: final.usage?.output_tokens }, model: final.model || this.model };
  }
}
