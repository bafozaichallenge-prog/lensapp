import type { ModelClient, ModelRequest, ModelResponse } from './agent';
import { AnalysisFailed } from './agent';

export interface AiConfig { apiKey: string; model: string; provider: 'anthropic'; baseUrl: string }

/** Read AI configuration from the environment. Returns null when no key is set: Lens then stays deterministic-only. */
export function aiConfigFromEnv(env: Record<string, string | undefined>): AiConfig | null {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  const provider = (env.LENS_AI_PROVIDER ?? 'anthropic').toLowerCase();
  if (provider !== 'anthropic') throw new Error(`Unsupported LENS_AI_PROVIDER "${provider}" (only "anthropic" is implemented)`);
  return { apiKey, provider: 'anthropic', model: env.LENS_MODEL?.trim() || 'claude-sonnet-5-5', baseUrl: env.ANTHROPIC_BASE_URL?.trim() || 'https://api.anthropic.com' };
}

/** Anthropic Messages API client. Worker-only: the key never reaches the browser, logs or prompts. */
export class AnthropicClient implements ModelClient {
  readonly provider = 'anthropic';
  readonly model: string;
  constructor(private cfg: AiConfig, private f: typeof fetch = fetch) { this.model = cfg.model; }

  async complete(req: ModelRequest): Promise<ModelResponse> {
    const res = await this.f(`${this.cfg.baseUrl.replace(/\/$/, '')}/v1/messages`, {
      method: 'POST', signal: req.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': this.cfg.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: this.cfg.model, max_tokens: req.maxTokens, system: req.system, messages: req.messages, ...(req.tools?.length ? { tools: req.tools } : {}) }),
    });
    if (res.status === 429) throw new AnalysisFailed('rate_limited', 'rate limited');
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (res.status === 400 && /too (long|large)|prompt is too long/i.test(body)) throw new AnalysisFailed('prompt_too_large', 'prompt too large');
      throw new AnalysisFailed('error', `Anthropic API ${res.status}`); // body deliberately not echoed: it may quote the prompt
    }
    const j = (await res.json()) as { content: ModelResponse['content']; stop_reason: string; usage?: { input_tokens?: number; output_tokens?: number } };
    return { content: j.content, stopReason: j.stop_reason, usage: { inputTokens: j.usage?.input_tokens ?? 0, outputTokens: j.usage?.output_tokens ?? 0 } };
  }
}
