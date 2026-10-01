// Offline provider: no AI. Replays a checked-in process definition as an explainer using fixed rules.
// It exists so the demo, tests and CI work without an API key, and so output stays usable when AI is switched off.
// It cannot answer free-form requests: it needs a matching process definition.
import { tokenize } from '../vector/embed.js';

const FIELD = (c) => ({ type: 'field', label: c.label, value: c.example ?? '', mode: c.mode || 'type', lockLabel: c.lockLabel });
const overlap = (a, b) => { const B = new Set(b); return a.filter((t) => B.has(t)).length; };

export class OfflineProvider {
  constructor() { this.name = 'offline'; this.model = 'offline-replay'; }

  async generate({ context }) {
    const { process: proc, prompt, hostContext, chunks } = context;
    if (!proc) throw Object.assign(new Error('Offline mode can only replay a checked-in process. Pick a process, or set ANTHROPIC_API_KEY to generate from a free-form request.'), { code: 'no_process' });
    const findings = (hostContext?.requirement?.findings || hostContext?.findings || []).map((f) => (typeof f === 'string' ? f : f.text || f.message || '')).filter(Boolean);
    const stepTokens = proc.steps.map((s) => tokenize(`${s.name} ${s.description} ${(s.rules || []).map((r) => r.text).join(' ')} ${(s.capture || []).map((c) => c.label).join(' ')}`));
    const placed = proc.steps.map(() => []);
    for (const f of findings) {
      const ft = tokenize(f); let best = -1, score = 0;
      stepTokens.forEach((st, i) => { const o = overlap(ft, st); if (o > score) { score = o; best = i; } });
      placed[best >= 0 ? best : proc.steps.length - 1].push(f);
    }
    const phases = proc.phases?.length ? proc.phases : ['Process'];
    const steps = proc.steps.map((s, i) => {
      const comps = [];
      const cap = (s.capture || []).map(FIELD);
      if (cap.length) comps.push({ type: 'card', title: s.name, children: cap.slice(0, 8) });
      if (s.validation) {
        const bad = placed[i].length > 0;
        comps.push({ type: 'verify', label: 'Run all rules', value: '', okText: 'Checked' });
        comps.push({ type: 'notice', kind: bad ? 'warn' : 'ok', text: bad ? 'Some rules need attention (see questions).' : s.validation.pass });
      }
      if (s.result) comps.push({ type: 'table', rows: s.result, emphasis: true });
      if (!comps.length) comps.push({ type: 'text', text: s.description });
      const last = i === proc.steps.length - 1;
      return {
        n: String(i + 1).padStart(2, '0'), phase: s.phase ?? 0, tone: 'accent', title: s.name, say: s.description,
        rules: [
          ...(s.rules || []).map((r) => ({ kind: r.kind || 'rule', text: r.code ? `${r.text} (${r.code})` : r.text })),
          ...placed[i].map((f) => ({ kind: 'question', text: `Open question: ${f}` })),
        ].slice(0, 6),
        carries: i < proc.steps.length - 1 && (s.capture || []).length ? [{ key: `s${s.id}`, text: s.capture.map((c) => c.label).slice(0, 2).join(' and ') }] : [],
        sources: [{ kind: 'process', ref: proc.id }, ...(s.requirement ? [{ kind: 'requirement', ref: s.requirement }] : []),
          ...(s.refs || []).slice(0, 3).map((ref) => ({ kind: 'code', ref }))],
        screen: { title: s.name, chrome: 'app', lead: '', next: last ? '' : 'Next', components: comps.slice(0, 8) },
      };
    });
    steps[0].tone = 'base';
    return {
      raw: {
        title: `${proc.name}: how it works`,
        subtitle: prompt ? `Follows the request: ${prompt.replace(/\s+/g, ' ').slice(0, 180)}` : proc.summary,
        footnote: `Replayed from the checked-in process "${proc.id}" without AI. Names, ids and amounts are sample data.`,
        brand: { base: { name: proc.brand?.base || 'App', color: '#868C94' }, accent: { name: proc.brand?.accent || proc.name, color: proc.brand?.accentColor || '#0A5BC4' } },
        phases, steps,
      },
      usage: {}, model: this.model,
    };
  }
}
