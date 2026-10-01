// Predefined processes live in the repo as *.process.json (one per process).
// Why JSON: it is diffable and reviewable, validated in CI (`explainer check`), carries the facts the AI must not invent
// (steps, rule codes, source refs), and keeps layout out of it. The HTML explainer is OUTPUT, never the source of truth.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tokenize, cosine } from './vector/embed.js';

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;

export function validateProcess(p, file = '') {
  const e = [];
  if (!p || typeof p !== 'object') return [`${file}: not an object`];
  for (const k of ['id', 'name', 'summary']) if (!isStr(p[k])) e.push(`${file}: "${k}" is required`);
  if (isStr(p.id) && !/^[a-z0-9][a-z0-9-]*$/.test(p.id)) e.push(`${file}: "id" must be kebab-case`);
  if (!Array.isArray(p.steps) || !p.steps.length) e.push(`${file}: "steps" must be a non-empty array`);
  const ids = new Set();
  (p.steps || []).forEach((s, i) => {
    const w = `${file}: steps[${i}]`;
    if (!isStr(s?.id)) e.push(`${w}.id is required`); else if (ids.has(s.id)) e.push(`${w}.id "${s.id}" is duplicated`); else ids.add(s.id);
    if (!isStr(s?.name)) e.push(`${w}.name is required`);
    if (!isStr(s?.description)) e.push(`${w}.description is required`);
    for (const [j, r] of (s?.rules || []).entries()) {
      if (!isStr(r?.text)) e.push(`${w}.rules[${j}].text is required`);
      if (r?.kind && !['gate', 'rule', 'data', 'question'].includes(r.kind)) e.push(`${w}.rules[${j}].kind "${r.kind}" is not gate|rule|data|question`);
    }
    for (const [j, c] of (s?.capture || []).entries()) if (!isStr(c?.label)) e.push(`${w}.capture[${j}].label is required`);
  });
  return e;
}

export function loadProcesses(dir) {
  const processes = [], errors = [];
  if (!dir || !existsSync(dir)) return { processes, errors: dir ? [`processes directory not found: ${dir}`] : [] };
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.process.json')).sort()) {
    try {
      const p = JSON.parse(readFileSync(join(dir, f), 'utf8')), errs = validateProcess(p, f);
      if (errs.length) errors.push(...errs); else processes.push(p);
    } catch (err) { errors.push(`${f}: ${err.message}`); }
  }
  return { processes, errors };
}

export const processText = (p) => [p.name, p.summary, ...(p.keywords || []), ...p.steps.map((s) => `${s.name} ${s.description} ${(s.rules || []).map((r) => r.text).join(' ')}`)].join('\n');

export class ProcessCatalog {
  constructor(processes, embedder) { this.processes = processes; this.embedder = embedder; this.vecs = null; }
  get(id) { return this.processes.find((p) => p.id === id); }
  async init() { this.vecs = this.processes.length ? await this.embedder.embed(this.processes.map(processText)) : []; return this; }
  /** Rank processes by semantic similarity plus a keyword boost; returns [{process, score}]. */
  async match(text, { min = 0.12, max = 2 } = {}) {
    if (!this.processes.length) return [];
    const [v] = await this.embedder.embed([text]), qt = new Set(tokenize(text));
    return this.processes.map((process, i) => {
      const kw = (process.keywords || []).filter((k) => qt.has(k.toLowerCase())).length;
      return { process, score: cosine(v, this.vecs[i]) + Math.min(0.3, kw * 0.1) };
    }).sort((a, b) => b.score - a.score).filter((m) => m.score >= min).slice(0, max);
  }
}
