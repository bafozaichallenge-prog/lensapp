// The explainer spec: the ONE contract between the AI and the renderer.
// The model never writes HTML or timings. It fills this structure; render.js owns the look.
// normalizeSpec() is deliberately forgiving about style (truncate, drop, remap) and strict about structure.

export const SPEC_VERSION = 1;
export const RULE_KINDS = ['gate', 'rule', 'data', 'question'];
export const COMPONENT_TYPES = ['field', 'verify', 'choice', 'segment', 'rows', 'checklist', 'signature', 'document',
  'otp', 'table', 'decision', 'carryover', 'notice', 'text', 'buttons', 'tiles', 'toast', 'card'];
export const LIMITS = { steps: 16, phases: 6, rules: 6, carries: 3, sources: 6, components: 8, children: 8 };

const HEX = /^#[0-9a-fA-F]{6}$/;
const clean = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
  .replace(/\s[—–]\s/g, ', ').replace(/[—–]/g, '-');

export function luminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
export function mix(hex, other, t) {
  const a = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)), b = [1, 3, 5].map((i) => parseInt(other.slice(i, i + 2), 16));
  return toHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
}
/** White text sits on these colours, so darken until contrast with white is at least 3:1. */
export function withWhiteContrast(hex) {
  let h = hex;
  for (let i = 0; i < 20 && 1.05 / (luminance(h) + 0.05) < 3; i++) h = mix(h, '#000000', 0.12);
  return h;
}

class Report {
  constructor() { this.errors = []; this.warnings = []; }
  err(p, m) { this.errors.push(`${p}: ${m}`); }
  warn(p, m) { this.warnings.push(`${p}: ${m}`); }
}

function str(v, max, path, r, { req = false, fallback = '' } = {}) {
  if (v == null || (typeof v === 'string' && !v.trim())) { if (req) r.err(path, 'is required'); return fallback; }
  if (typeof v !== 'string' && typeof v !== 'number') { r.warn(path, 'expected text, ignored'); return fallback; }
  let s = clean(v);
  if (s.length > max) {
    const cut = s.slice(0, max - 1);
    const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(', '), cut.lastIndexOf(' '));
    s = (stop > max * 0.6 ? cut.slice(0, stop) : cut).replace(/[,.\s]+$/, '') + '…';
    r.warn(path, `shortened to ${max} characters`);
  }
  return s;
}
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const arr = (v) => (Array.isArray(v) ? v : []);
const int = (v, lo, hi, d) => { const n = Number.isInteger(v) ? v : parseInt(v, 10); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };

function strList(v, max, maxLen, path, r) {
  return arr(v).slice(0, max).map((x, i) => str(x, maxLen, `${path}[${i}]`, r)).filter(Boolean);
}
function pairs(v, path, r, max = 10) {
  return arr(v).slice(0, max).map((x, i) => ({
    k: str(x?.k ?? x?.label, 60, `${path}[${i}].k`, r), v: str(x?.v ?? x?.value, 80, `${path}[${i}].v`, r),
    tone: oneOf(x?.tone, ['ok', 'warn', 'bad'], undefined),
  })).filter((p) => p.k);
}
function options(v, path, r, max = 4) {
  return arr(v).slice(0, max).map((o, i) => (typeof o === 'string' ? { label: str(o, 40, `${path}[${i}]`, r) } : {
    label: str(o?.label, 40, `${path}[${i}].label`, r), sub: str(o?.sub, 50, `${path}[${i}].sub`, r), disabled: !!o?.disabled,
  })).filter((o) => o.label);
}

/** Normalise one screen component. Returns null (with a warning) when it cannot be rendered. */
function component(c, path, r, nested) {
  if (!c || typeof c !== 'object') { r.warn(path, 'not an object, dropped'); return null; }
  const type = c.type;
  if (!COMPONENT_TYPES.includes(type) || (nested && type === 'card')) { r.warn(path, `unsupported component "${type}", dropped`); return null; }
  switch (type) {
    case 'field': {
      const label = str(c.label, 40, `${path}.label`, r, { req: true });
      return { type, label, value: str(c.value, 60, `${path}.value`, r), mode: oneOf(c.mode, ['type', 'static', 'locked', 'fill'], 'type'), lockLabel: str(c.lockLabel, 14, `${path}.lockLabel`, r) };
    }
    case 'verify':
      return { type, label: str(c.label, 40, `${path}.label`, r, { req: true }), value: str(c.value, 40, `${path}.value`, r), okText: str(c.okText, 40, `${path}.okText`, r, { fallback: 'Verified' }) };
    case 'choice': {
      const o = options(c.options, `${path}.options`, r); if (!o.length) { r.err(path, 'choice needs options'); return null; }
      return { type, options: o, selected: int(c.selected, 0, o.length - 1, 0) };
    }
    case 'segment': {
      const o = options(c.options, `${path}.options`, r, 3); if (o.length < 2) { r.err(path, 'segment needs 2 or 3 options'); return null; }
      return { type, label: str(c.label, 40, `${path}.label`, r), options: o, selected: int(c.selected, 0, o.length - 1, 0) };
    }
    case 'rows': {
      const items = arr(c.items).slice(0, 6).map((x, i) => ({
        title: str(x?.title, 40, `${path}.items[${i}].title`, r, { req: true }), sub: str(x?.sub, 70, `${path}.items[${i}].sub`, r),
        amount: str(x?.amount, 20, `${path}.items[${i}].amount`, r), warn: !!x?.warn, fixedSub: str(x?.fixedSub, 70, `${path}.items[${i}].fixedSub`, r),
      })).filter((x) => x.title);
      if (!items.length) { r.err(path, 'rows needs items'); return null; }
      const total = c.total && typeof c.total === 'object' ? { label: str(c.total.label, 30, `${path}.total.label`, r, { fallback: 'Total' }), value: str(c.total.value, 20, `${path}.total.value`, r) } : undefined;
      return { type, items, total: total?.value ? total : undefined, action: str(c.action, 20, `${path}.action`, r) };
    }
    case 'checklist': {
      const items = strList(c.items, 4, 90, `${path}.items`, r); if (!items.length) { r.err(path, 'checklist needs items'); return null; }
      return { type, items, gate: c.gate !== false };
    }
    case 'signature': return { type, caption: str(c.caption, 40, `${path}.caption`, r) };
    case 'document':
      return { type, title: str(c.title, 40, `${path}.title`, r, { req: true }), lines: strList(c.lines, 3, 70, `${path}.lines`, r), signed: str(c.signed, 30, `${path}.signed`, r) };
    case 'otp': {
      const code = String(c.code ?? '').replace(/\D/g, '').slice(0, 6); if (code.length < 4) { r.err(path, 'otp code needs 4 to 6 digits'); return null; }
      return { type, message: str(c.message, 90, `${path}.message`, r), code };
    }
    case 'table': {
      const rows = pairs(c.rows, `${path}.rows`, r); if (!rows.length) { r.err(path, 'table needs rows'); return null; }
      return { type, rows, emphasis: !!c.emphasis };
    }
    case 'decision': {
      const o = options(c.options, `${path}.options`, r, 3); if (o.length < 2) { r.err(path, 'decision needs 2 or 3 options'); return null; }
      return { type, text: str(c.text, 120, `${path}.text`, r, { req: true }), options: o, pick: int(c.pick, 0, o.length - 1, o.length - 1), then: str(c.then, 40, `${path}.then`, r) };
    }
    case 'carryover': {
      const items = arr(c.items).slice(0, 10).map((x, i) => ({ label: str(x?.label, 50, `${path}.items[${i}].label`, r), state: oneOf(x?.state, ['copied', 'cleared'], 'copied') })).filter((x) => x.label);
      if (!items.length) { r.err(path, 'carryover needs items'); return null; }
      return { type, items };
    }
    case 'notice': return { type, text: str(c.text, 140, `${path}.text`, r, { req: true }), kind: oneOf(c.kind, ['info', 'ok', 'warn', 'error'], 'info') };
    case 'text': return { type, text: str(c.text, 160, `${path}.text`, r, { req: true }) };
    case 'buttons': {
      const items = arr(c.items).slice(0, 3).map((b, i) => ({ label: str(typeof b === 'string' ? b : b?.label, 24, `${path}.items[${i}]`, r), style: oneOf(b?.style, ['ghost', 'primary', 'grey'], 'ghost') })).filter((b) => b.label);
      if (!items.length) { r.err(path, 'buttons needs items'); return null; }
      return { type, items, tap: c.tap == null ? -1 : int(c.tap, 0, items.length - 1, -1) };
    }
    case 'tiles': {
      const items = strList(c.items, 4, 40, `${path}.items`, r); if (!items.length) { r.err(path, 'tiles needs items'); return null; }
      return { type, items, tap: int(c.tap, 0, items.length - 1, 0) };
    }
    case 'toast': return { type, text: str(c.text, 90, `${path}.text`, r, { req: true }) };
    case 'card': {
      const children = arr(c.children).slice(0, LIMITS.children).map((x, i) => component(x, `${path}.children[${i}]`, r, true)).filter(Boolean);
      if (!children.length) { r.err(path, 'card needs children'); return null; }
      return { type, title: str(c.title, 50, `${path}.title`, r, { req: true }), children };
    }
  }
  return null;
}

function brandSide(b, d, path, r) {
  let color = typeof b?.color === 'string' && HEX.test(b.color) ? b.color : d.color;
  if (b?.color && !HEX.test(b.color)) r.warn(`${path}.color`, 'must be #RRGGBB, default used');
  const adj = withWhiteContrast(color);
  if (adj !== color) r.warn(`${path}.color`, 'darkened so white text stays readable');
  return { name: str(b?.name, 22, `${path}.name`, r, { fallback: d.name }), color: adj };
}

/**
 * @returns {{ok:boolean, spec?:object, errors:string[], warnings:string[]}}
 * errors = structural problems worth asking the model to fix; warnings = repaired silently.
 */
export function normalizeSpec(input) {
  const r = new Report();
  if (!input || typeof input !== 'object') return { ok: false, errors: ['root: expected an object'], warnings: [] };
  const spec = { version: SPEC_VERSION };
  spec.title = str(input.title, 80, 'title', r, { req: true });
  spec.subtitle = str(input.subtitle, 300, 'subtitle', r);
  spec.footnote = str(input.footnote, 320, 'footnote', r);
  spec.brand = {
    base: brandSide(input.brand?.base, { name: 'App', color: '#868C94' }, 'brand.base', r),
    accent: brandSide(input.brand?.accent, { name: 'Process', color: '#E30613' }, 'brand.accent', r),
  };

  let phases = arr(input.phases).slice(0, LIMITS.phases).map((p, i) => str(typeof p === 'string' ? p : p?.name, 24, `phases[${i}]`, r)).filter(Boolean);
  if (!phases.length) { phases = ['Process']; r.warn('phases', 'none given, single phase used'); }

  const rawSteps = arr(input.steps).slice(0, LIMITS.steps);
  if (arr(input.steps).length > LIMITS.steps) r.warn('steps', `only the first ${LIMITS.steps} steps are kept`);
  if (!rawSteps.length) r.err('steps', 'at least one step is required');

  let steps = rawSteps.map((s, i) => {
    const p = `steps[${i}]`;
    let ph = typeof s?.phase === 'string' && isNaN(+s.phase) ? phases.findIndex((n) => n.toLowerCase() === s.phase.toLowerCase()) : int(s?.phase, 0, phases.length - 1, 0);
    if (ph < 0) { ph = 0; r.warn(`${p}.phase`, 'unknown phase, first used'); }
    const step = {
      n: '', phase: ph, tone: oneOf(s?.tone, ['base', 'accent'], 'accent'),
      title: str(s?.title, 70, `${p}.title`, r, { req: true }), say: str(s?.say, 340, `${p}.say`, r, { req: true }),
    };
    const rawN = clean(s?.n ?? '').slice(0, 4); step.n = rawN;
    if (s?.badge && typeof s.badge === 'object') {
      const text = str(s.badge.text, 240, `${p}.badge.text`, r);
      if (text) step.badge = { kind: oneOf(s.badge.kind, ['New', 'Changed'], 'Changed'), text };
    }
    step.rules = arr(s?.rules).slice(0, LIMITS.rules).map((x, j) => ({ kind: oneOf(x?.kind, RULE_KINDS, 'rule'), text: str(x?.text, 280, `${p}.rules[${j}].text`, r) })).filter((x) => x.text);
    step.carries = arr(s?.carries).slice(0, LIMITS.carries).map((x, j) => ({
      key: clean(x?.key).toLowerCase().replace(/[^a-z0-9_]+/g, '-').slice(0, 24) || `k${i}${j}`, text: str(x?.text, 80, `${p}.carries[${j}].text`, r),
    })).filter((x) => x.text);
    if (s?.handoff && typeof s.handoff === 'object') {
      const states = {}, labels = {};
      for (const [k, v] of Object.entries(s.handoff.states || {})) if (['copied', 'cleared', 'parent'].includes(v)) states[k] = v;
      for (const [k, v] of Object.entries(s.handoff.labels || {})) labels[k] = str(v, 80, `${p}.handoff.labels.${k}`, r);
      step.handoff = { note: str(s.handoff.note, 160, `${p}.handoff.note`, r), states, labels };
    }
    step.sources = arr(s?.sources).slice(0, LIMITS.sources).map((x, j) => ({
      kind: oneOf(x?.kind, ['code', 'process', 'requirement', 'prompt', 'context'], 'code'), ref: str(x?.ref, 140, `${p}.sources[${j}].ref`, r),
    })).filter((x) => x.ref);
    const sc = s?.screen && typeof s.screen === 'object' ? s.screen : null;
    if (!sc) r.err(`${p}.screen`, 'is required');
    const comps = arr(sc?.components).slice(0, LIMITS.components).map((c, j) => component(c, `${p}.screen.components[${j}]`, r, false)).filter(Boolean);
    if (sc && !comps.length) r.err(`${p}.screen.components`, 'needs at least one valid component');
    step.screen = {
      title: str(sc?.title, 40, `${p}.screen.title`, r, { fallback: step.title.slice(0, 40) }), chrome: oneOf(sc?.chrome, ['app', 'plain'], 'app'),
      lead: str(sc?.lead, 12, `${p}.screen.lead`, r), next: str(sc?.next, 20, `${p}.screen.next`, r), components: comps,
    };
    return step;
  });

  // keep the track grouped by phase, drop empty phases, number steps
  if (steps.some((s, i) => i && s.phase < steps[i - 1].phase)) { r.warn('steps', 'sorted by phase'); steps = steps.map((s, i) => ({ s, i })).sort((a, b) => a.s.phase - b.s.phase || a.i - b.i).map((x) => x.s); }
  const used = [...new Set(steps.map((s) => s.phase))];
  if (used.length !== phases.length) { steps.forEach((s) => { s.phase = used.indexOf(s.phase); }); phases = used.map((i) => phases[i]); }
  const seen = new Set();
  steps.forEach((s, i) => { if (!s.n || seen.has(s.n)) s.n = String(i + 1).padStart(2, '0'); seen.add(s.n); });
  const keys = new Set(steps.flatMap((s) => s.carries.map((c) => c.key)));
  for (const s of steps) if (s.handoff) for (const k of Object.keys(s.handoff.states)) if (!keys.has(k)) { delete s.handoff.states[k]; r.warn(`step ${s.n}.handoff`, `unknown carry key "${k}" removed`); }

  spec.phases = phases; spec.steps = steps;
  return { ok: r.errors.length === 0, spec, errors: r.errors, warnings: r.warnings };
}
