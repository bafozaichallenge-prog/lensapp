// JSON Schema handed to the model (structured outputs). Only the keywords structured outputs support:
// object/array/string/boolean/integer, enum, required, additionalProperties:false, anyOf, $ref to non-recursive $defs.
// Limits (lengths, counts) are NOT expressed here; normalizeSpec() enforces them and the prompt states them.
const S = { type: 'string' };
const opt = { type: 'array', items: { type: 'string' } };
const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const t = (name) => ({ type: 'string', enum: [name] });
const optionObj = obj({ label: S, sub: S });
const pairObj = obj({ k: S, v: S, tone: { type: 'string', enum: ['ok', 'warn', 'bad', 'none'] } });

const leaves = {
  field: obj({ type: t('field'), label: S, value: S, mode: { type: 'string', enum: ['type', 'static', 'locked', 'fill'] }, lockLabel: S }),
  verify: obj({ type: t('verify'), label: S, value: S, okText: S }),
  choice: obj({ type: t('choice'), options: { type: 'array', items: optionObj }, selected: { type: 'integer' } }),
  segment: obj({ type: t('segment'), label: S, options: opt, selected: { type: 'integer' } }),
  rows: obj({ type: t('rows'), items: { type: 'array', items: obj({ title: S, sub: S, amount: S, warn: { type: 'boolean' }, fixedSub: S }) },
    totalLabel: S, totalValue: S, action: S }),
  checklist: obj({ type: t('checklist'), items: opt, gate: { type: 'boolean' } }),
  signature: obj({ type: t('signature'), caption: S }),
  document: obj({ type: t('document'), title: S, lines: opt, signed: S }),
  otp: obj({ type: t('otp'), message: S, code: S }),
  table: obj({ type: t('table'), rows: { type: 'array', items: pairObj }, emphasis: { type: 'boolean' } }),
  decision: obj({ type: t('decision'), text: S, options: opt, pick: { type: 'integer' }, then: S }),
  carryover: obj({ type: t('carryover'), items: { type: 'array', items: obj({ label: S, state: { type: 'string', enum: ['copied', 'cleared'] } }) } }),
  notice: obj({ type: t('notice'), text: S, kind: { type: 'string', enum: ['info', 'ok', 'warn', 'error'] } }),
  text: obj({ type: t('text'), text: S }),
  buttons: obj({ type: t('buttons'), items: opt, tap: { type: 'integer' } }),
  tiles: obj({ type: t('tiles'), items: opt, tap: { type: 'integer' } }),
  toast: obj({ type: t('toast'), text: S }),
};
const leafRefs = Object.keys(leaves).map((k) => ({ $ref: `#/$defs/${k}` }));
const card = obj({ type: t('card'), title: S, children: { type: 'array', items: { anyOf: leafRefs } } });

export const OUTPUT_SCHEMA = {
  ...obj({
    title: S, subtitle: S, footnote: S,
    brand: obj({ base: obj({ name: S, color: S }), accent: obj({ name: S, color: S }) }),
    phases: opt,
    steps: { type: 'array', items: obj({
      n: S, phase: { type: 'integer' }, tone: { type: 'string', enum: ['base', 'accent'] }, title: S, say: S,
      badge: obj({ kind: { type: 'string', enum: ['New', 'Changed', 'none'] }, text: S }),
      rules: { type: 'array', items: obj({ kind: { type: 'string', enum: ['gate', 'rule', 'data', 'question'] }, text: S }) },
      carries: { type: 'array', items: obj({ key: S, text: S }) },
      handoffNote: S,
      handoffStates: { type: 'array', items: obj({ key: S, state: { type: 'string', enum: ['copied', 'cleared', 'parent'] } }) },
      sources: { type: 'array', items: obj({ kind: { type: 'string', enum: ['code', 'process', 'requirement', 'prompt', 'context'] }, ref: S }) },
      screen: obj({ title: S, chrome: { type: 'string', enum: ['app', 'plain'] }, lead: S, next: S,
        components: { type: 'array', items: { anyOf: [...leafRefs, { $ref: '#/$defs/card' }] } } }),
    }) },
  }),
  $defs: { ...leaves, card },
};

/** The model-facing shape is flatter than the stored spec (no free-form maps, no "none" sentinels); map it back. */
export function fromModelShape(m) {
  if (!m || typeof m !== 'object') return m;
  const fixComp = (c) => {
    if (!c || typeof c !== 'object') return c;
    const o = { ...c };
    if (o.type === 'rows') { if (o.totalValue) o.total = { label: o.totalLabel, value: o.totalValue }; delete o.totalLabel; delete o.totalValue; }
    if (o.type === 'table') o.rows = (o.rows || []).map((r) => ({ ...r, tone: r.tone === 'none' ? undefined : r.tone }));
    if (o.type === 'otp') o.code = String(o.code ?? '');
    if (Array.isArray(o.children)) o.children = o.children.map(fixComp);
    return o;
  };
  return {
    ...m,
    steps: (m.steps || []).map((s) => {
      const o = { ...s };
      if (o.badge && (o.badge.kind === 'none' || !o.badge.text)) delete o.badge;
      if (o.handoffStates?.length) {
        o.handoff = { note: o.handoffNote, states: Object.fromEntries(o.handoffStates.map((h) => [h.key, h.state])), labels: {} };
      }
      delete o.handoffNote; delete o.handoffStates;
      if (o.screen) o.screen = { ...o.screen, components: (o.screen.components || []).map(fixComp) };
      return o;
    }),
  };
}
