import type { ImpactResult } from '@lens/impact';
import { Fence } from './untrusted';
import { systemPrompt, userPrompt, type ChangeRequest } from './prompt';
import { makeTools, runTool, toolDefs } from './tools';
import { extractJson, validateAnalysis, normalizeAnalysis, PROMPT_VERSION, SCHEMA_VERSION, type Analysis } from './schema';
import { checkGrounding, enforceGrounding, groundingErrors, type GroundingIssue } from './grounding';
import type { RepoIndex } from './repo';

export type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };
export interface Msg { role: 'user' | 'assistant'; content: string | Block[] }
export interface ModelRequest { system: string; messages: Msg[]; tools?: { name: string; description: string; input_schema: Record<string, unknown> }[]; maxTokens: number; signal?: AbortSignal }
export interface ModelResponse { content: Block[]; stopReason: string; usage: { inputTokens: number; outputTokens: number } }
export interface ModelClient { provider: string; model: string; complete(req: ModelRequest): Promise<ModelResponse> }

export class AnalysisCancelled extends Error { constructor() { super('Analysis stopped.'); this.name = 'AnalysisCancelled'; } }
export class AnalysisFailed extends Error { constructor(public code: 'invalid_json' | 'prompt_too_large' | 'rate_limited' | 'error', message: string) { super(message); this.name = 'AnalysisFailed'; } }

export const ERROR_TEXT: Record<string, string> = {
  rate_limited: 'Too many requests right now. Wait a minute, then run the analysis again.',
  invalid_json: 'The analysis came back in an unexpected format. Run it again.',
  prompt_too_large: 'The requirement documents are too large to analyse in one go. Remove the least relevant document and run it again.',
  cancelled: 'Analysis stopped.',
};

export const MAX_TURNS = 12;

export interface AnalysisOutcome {
  analysis: Analysis;
  issues: GroundingIssue[];       // remaining grounding notes (warnings) after enforcement
  dropped: GroundingIssue[];      // findings removed because they could not be grounded
  usage: { inputTokens: number; outputTokens: number };
  turns: number;
  durationMs: number;
  redactions: { type: string; count: number }[];
  provider: string; model: string; promptVersion: string; schemaVersion: number;
}

export interface RunInput {
  index: RepoIndex;
  impact: ImpactResult;
  request: ChangeRequest;
  model: ModelClient;
  onProgress?: (message: string) => void;
  signal?: AbortSignal;
  maxTurns?: number;
  maxTokens?: number;
  /** Token ceiling across the whole analysis (cost control). */
  tokenBudget?: number;
}

/**
 * Tool-use loop (<= 12 turns) followed by schema validation and grounding, each with one corrective retry
 * (plan §15.6). Ungroundable findings are dropped, never presented as fact.
 */
export async function runAnalysis(r: RunInput): Promise<AnalysisOutcome> {
  const t0 = Date.now(), maxTurns = r.maxTurns ?? MAX_TURNS, say = (m: string) => r.onProgress?.(m);
  const fence = new Fence();
  const tools = makeTools(r.index, say);
  const system = systemPrompt(fence);
  const messages: Msg[] = [{ role: 'user', content: userPrompt(r.index, r.impact, r.request, fence) }];
  const usage = { inputTokens: 0, outputTokens: 0 };
  let turns = 0;

  const call = async (withTools: boolean): Promise<ModelResponse> => {
    if (r.signal?.aborted) throw new AnalysisCancelled();
    if (r.tokenBudget && usage.inputTokens + usage.outputTokens > r.tokenBudget) throw new AnalysisFailed('prompt_too_large', 'Token budget exceeded');
    const res = await r.model.complete({ system, messages, tools: withTools ? toolDefs(tools) : undefined, maxTokens: r.maxTokens ?? 16000, signal: r.signal });
    usage.inputTokens += res.usage.inputTokens; usage.outputTokens += res.usage.outputTokens; turns++;
    if (r.signal?.aborted) throw new AnalysisCancelled();
    return res;
  };
  const textOf = (c: Block[]) => c.filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text').map((b) => b.text).join('\n');

  // ---- tool loop
  let final = '';
  for (;;) {
    const last = turns >= maxTurns - 1;
    const res = await call(!last);
    messages.push({ role: 'assistant', content: res.content });
    const uses = res.content.filter((b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use');
    if (res.stopReason === 'tool_use' && uses.length && !last) {
      const results: Block[] = uses.map((u) => {
        const out = runTool(tools, u.name, u.input);
        // tool output is repository data: fence it like everything else
        return { type: 'tool_result', tool_use_id: u.id, content: fence.wrap(`tool ${u.name}`, out.text), is_error: out.isError };
      });
      messages.push({ role: 'user', content: results });
      continue;
    }
    if (last && uses.length) { messages.push({ role: 'user', content: 'Stop using tools. Reply now with the final JSON object only.' }); continue; }
    final = textOf(res.content);
    break;
  }

  // ---- validation (one retry with the validation errors)
  say('Validating output');
  const parse = (text: string) => { try { return validateAnalysis(extractJson(text)); } catch (e) { return { ok: false as const, errors: [(e as Error).message] }; } };
  let v = parse(final);
  if (!v.ok) {
    messages.push({ role: 'user', content: `Your reply did not validate:\n- ${v.errors.slice(0, 20).join('\n- ')}\nReply again with ONLY the corrected JSON object.` });
    const res = await call(false);
    messages.push({ role: 'assistant', content: res.content });
    v = parse(textOf(res.content));
    if (!v.ok) throw new AnalysisFailed('invalid_json', `${ERROR_TEXT.invalid_json} (${v.errors[0]})`);
  }

  // ---- grounding (one corrective pass, then enforce)
  let analysis = normalizeAnalysis(v.value, r.index.view.processes);
  const errs = groundingErrors(checkGrounding(analysis, r.index));
  if (errs.length) {
    say('Checking evidence');
    messages.push({ role: 'user', content: `These items are not grounded in the repository:\n- ${errs.slice(0, 15).map((e) => `${e.where}: ${e.message}`).join('\n- ')}\nReply again with ONLY the corrected JSON object. Use exact paths/ids, or mark new files as "new"; move anything you cannot support into "questions".` });
    try {
      const res = await call(false);
      const v2 = parse(textOf(res.content));
      if (v2.ok) analysis = normalizeAnalysis(v2.value, r.index.view.processes);
    } catch (e) { if (e instanceof AnalysisCancelled) throw e; /* keep the first result and enforce below */ }
  }
  const g = enforceGrounding(analysis, r.index);
  return {
    analysis: g.analysis, issues: g.issues.filter((x) => x.level === 'warn'), dropped: g.dropped, usage, turns, durationMs: Date.now() - t0,
    redactions: fence.redactions, provider: r.model.provider, model: r.model.model, promptVersion: PROMPT_VERSION, schemaVersion: SCHEMA_VERSION,
  };
}
