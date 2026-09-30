/* eslint-disable @typescript-eslint/no-explicit-any */
import { camelWords, norm, titleCase, prettyBody, CODE_KINDS, incidentsForStage, ticketOf, type PGraph } from './graph';

export const VERT_COLOURS: Record<string, string> = { 'Personal Insurance': '#0A5BC4', 'Medical Aid': '#0E8C7A', 'Lending': '#5B3FB8', 'Pension and Annuities': '#B35C00', 'Group Risk': '#1A6FA8', 'Core (Research team)': '#3C4A5C', 'Other': '#0A5BC4' };

/** Facts scraped from the code: static property groups, seed rows, ID prefixes, rule failures and role gates. */
export function modelOf(g: PGraph): any {
  const statics: any = {}, seeds: any = {}, prefixes: any = {}, ruleInfo: any = {}, roleChecks: any = {};
  for (const f of Object.values(g.files).filter((f) => CODE_KINDS.has(f.kind))) {
    for (const m of f.text.matchAll(/STATIC PROPERTY\s+([A-Z]+)_([A-Z0-9_]+)\s+AS CHARACTER[^\n]*?INITIAL\s+"([^"]+)"/g)) ((statics[f.name] ||= {})[m[1]!] ||= []).push(m[3]);
    if (/seed/i.test(f.path)) {
      const cls: any = {};
      for (const m of f.text.matchAll(/(\w+)\s*=\s*NEW\s+(\w+)\s*\(/g)) cls[m[1]!] = m[2];
      for (const m of f.text.matchAll(/(\w+):Create\(([^)]*)\)/g)) {
        const c = cls[m[1]!]; if (!c) continue;
        const strs = [...m[2]!.matchAll(/"([^"]*)"/g)].map((x) => x[1]!);
        const nums = m[2]!.replace(/"[^"]*"/g, '').match(/(?:^|,)\s*(\d+(?:\.\d+)?)\s*(?=,|$)/g);
        (seeds[c] ||= []).push({ v: strs[0], code: strs[1] || strs[0], l: strs[2] || strs[1] || strs[0], amt: nums ? parseFloat(nums[0]!.replace(/[, ]/g, '')) : null, status: strs.find((s) => /^(ACTIVE|INACTIVE|EXPIRED|PENDING)$/.test(s)) || null });
      }
    }
    for (const m of f.text.matchAll(/SUBSTITUTE\("([A-Z]{2,5})-&1"/g)) { const t = f.name.replace(/^Db/, '').replace(/Repository$/, ''); if (g.tables[t]) prefixes[t] = m[1]; }
    const sup = f.text.match(/SUPER\(\s*"([A-Z]{2,5}-[A-Z]+-\d{3})",\s*"([^"]+)"/);
    if (sup) { const fails = [...f.text.matchAll(/CreateFailureResult\(\s*(?:SUBSTITUTE\()?\s*"([^"]+)"[\s\S]*?"(\w+)"\s*\)\s*\./g)].map((x) => ({ msg: x[1]!.replace(/&\d/g, '…'), field: x[2]! })); ruleInfo[sup[1]!] = { desc: sup[2], fails, file: f.path }; }
    const roles = [...new Set([...f.text.matchAll(/HasRole\(\s*\w+:ROLE_(\w+)\s*\)/g)].map((x) => x[1]!))];
    if (roles.length) roleChecks[f.path] = roles;
  }
  const roleVals = Object.values(statics).flatMap((gr: any) => gr.ROLE || []);
  return { statics, seeds, prefixes, ruleInfo, roleChecks, roles: [...new Set(roleVals)] };
}

const SAMPLE: [RegExp, string][] = [
  [/^firstname$|^name$/, 'Sizwe'], [/surname|lastname/, 'Dlamini'], [/dateofbirth|birth|dob/, '1984-03-12'], [/idnumber|nationalid/, '8403125009082'],
  [/email/, 'sizwe.dlamini@mail.co.za'], [/mobile|cell|phone/, '082 555 0142'], [/address/, '12 Jan Smuts Ave, Rosebank'], [/accountholder/, 'S Dlamini'],
  [/accountnumber|accountno/, '6200000431'], [/bankcode|branch/, '250655'], [/day$/, '25'], [/description/, 'Sample description'], [/amount|premium|cover/, '250'],
];
/** Sample values are synthetic (plan §22.5). */
export function sampleFor(field: string, type: string): string {
  const n = norm(field);
  for (const [re, v] of SAMPLE) if (re.test(n)) return v;
  if (type === 'date') return '2026-10-01';
  if (type === 'integer' || type === 'decimal') return '1';
  if (type === 'logical') return 'yes';
  return 'Sample ' + titleCase(field).toLowerCase();
}
const stemMatch = (a: string, b: string) => a === b || (a.length >= 5 && b.length >= 5 && (a.startsWith(b.slice(0, 5)) || b.startsWith(a.slice(0, 5))));
const overlap = (aWords: string[], bWords: string[]) => { let n = 0; for (const a of aWords) if (bWords.some((b) => stemMatch(a.replace(/s$/, ''), b.replace(/s$/, '')))) n++; return n; };
const stageWords = (st: { name: string }) => camelWords(st.name).filter((w) => w.length > 2 && !['capture', 'link', 'new', 'details', 'the', 'and'].includes(w));
export function stageKind(st: { name: string }): 'validate' | 'action' | 'form' {
  const n = st.name.toLowerCase();
  if (/validat|verify|check|assess/.test(n)) return 'validate';
  if (/activat|approv|submit|issue|complete|finali|authoris|authoriz|accept|cancel|lapse|terminat|close|reinstat/.test(n)) return 'action';
  return 'form';
}

export interface SpecOptions {
  source: string;
  vertical: string;
  /** Deterministic timestamp for caching/tests; defaults to now. */
  generatedAt?: string;
  /** Accepted wording refinement (see refine.ts). */
  override?: { steps: any[] } | null;
}

/** Deterministic process specification (screens, rules, data, sample values) derived from the code. Literal port of the prototype buildSpec(). */
export function buildSpec(g: PGraph, pi: number, opt: SpecOptions): any {
  const pr = g.processes[pi]!, M = modelOf(g);
  const tables = g.tables, tnames = Object.keys(tables);
  const ownPk: Record<string, string | null> = {};
  for (const t of tnames) { const fl = tables[t]!.fields; const byName = fl.find((x) => x.name === t + 'Id'); ownPk[t] = byName ? byName.name : (fl[0] && !tnames.some((o) => o !== t && fl[0]!.name === o + 'Id') ? fl[0].name : null); }
  const pkOf = (t: string) => ownPk[t];
  const isCatalogue = (t: string) => !!(M.seeds[t] && M.seeds[t].length);
  const fkTarget = (fname: string, own: string) => tnames.find((t) => t !== own && pkOf(t) && fname !== pkOf(own) && fname.endsWith(pkOf(t)!));
  const home: Record<string, number> = {};
  for (const t of tnames) {
    if (isCatalogue(t)) continue;
    let best = -1, bs = -1;
    const tw = camelWords(t).filter((w) => !tnames.some((o) => o !== t && !isCatalogue(o) && norm(o) === w));
    pr.stages.forEach((st, i) => { if (!st.tables.includes(t)) return; const sc = overlap(tw.length ? tw : camelWords(t), stageWords(st)) * 2 - i * 0.01; if (sc > bs) { bs = sc; best = i; } });
    if (best >= 0) home[t] = best;
  }
  const staticsFor = (t: string, field: string) => {
    const groups = M.statics[t] || {}; const fw = camelWords(field);
    for (const [gname, vals] of Object.entries(groups)) if (gname !== 'STATUS' && fw.some((w) => stemMatch(w, gname.toLowerCase()))) return vals as string[];
    return null;
  };
  const fieldsByStage: any[][] = pr.stages.map(() => []);
  const lists: any[] = pr.stages.map(() => null);
  const stateSample: Record<string, any> = {};
  const statusKeys: Record<string, string> = {};
  for (const [t, hi] of Object.entries(home)) {
    const T = tables[t]!, pk = pkOf(t);
    const catFk = T.fields.map((f) => ({ f, tgt: fkTarget(f.name, t) })).filter((x) => x.tgt && isCatalogue(x.tgt));
    const parentFk = T.fields.find((f) => { const tg = fkTarget(f.name, t); return tg && !isCatalogue(tg) && home[tg] !== undefined && home[tg]! < hi; });
    if (catFk.length && parentFk) {
      const cat = catFk[0]!.tgt!, opts = M.seeds[cat].map((s: any) => ({ v: s.v, l: s.l, code: s.code, amt: s.amt, off: s.status && s.status !== 'ACTIVE' }));
      const amtField = T.fields.find((f) => f.type === 'decimal');
      lists[hi] = { k: `${t}[]`, table: t, cat, label: titleCase(cat) + (/s$/.test(cat) ? '' : 's'), options: opts, amtLabel: amtField ? titleCase(amtField.name) : null, sample: opts.filter((o: any) => !o.off).slice(0, 2).map((o: any) => o.v) };
      stateSample[`${t}[]`] = lists[hi].sample;
      continue;
    }
    for (const f of T.fields) {
      const k = `${t}.${f.name}`, fw = camelWords(f.name);
      const def: any = { k, table: t, field: f.name, label: titleCase(f.name), type: 'text', sample: '', required: false };
      let target = hi;
      const tgt = fkTarget(f.name, t);
      if (f.name === pk) { def.type = 'system'; def.sample = `${M.prefixes[t] || t.slice(0, 3).toUpperCase()}-000001`; def.note = 'Generated by the system'; }
      else if (/^status$/i.test(f.name) && M.statics[t] && M.statics[t].STATUS) { def.type = 'system'; def.options = M.statics[t].STATUS; def.sample = M.statics[t].STATUS[0]; def.note = 'Set by the system'; statusKeys[t] = k; }
      else if (f.type === 'datetime' || (f.type === 'date' && /created|modified|effective|activated|updated/i.test(f.name))) { def.type = 'system'; def.sample = 'Set on save'; def.note = 'Stamped by the system'; }
      else if (tgt && isCatalogue(tgt)) { def.label = titleCase(f.name.replace(/Id$/, '')) || def.label; def.type = 'select'; def.options = M.seeds[tgt].map((s: any) => ({ v: s.v, l: `${s.code}${s.l && s.l !== s.code ? ' — ' + s.l : ''}`, off: s.status && s.status !== 'ACTIVE' })); def.sample = (def.options.find((o: any) => !o.off) || def.options[0] || {}).v || ''; }
      else if (tgt && home[tgt] !== undefined) { def.type = 'linked'; def.target = tgt; def.sample = `${M.prefixes[tgt] || tgt.slice(0, 3).toUpperCase()}-000001`; def.note = home[tgt]! > hi ? `Linked when ${titleCase(tgt).toLowerCase()} details are captured` : `Linked to the ${titleCase(tgt).toLowerCase()} from an earlier step`; if (home[tgt]! > hi) target = home[tgt]!; }
      else if (f.type === 'decimal' && /^total/i.test(f.name)) { def.type = 'computed'; def.note = 'Adds up the selected items'; def.sample = ''; }
      else if (staticsFor(t, f.name)) { def.type = 'select'; def.options = staticsFor(t, f.name)!.map((v) => ({ v, l: titleCase(v.toLowerCase().replace(/_/g, ' ')) })); def.sample = def.options[0].v; }
      else if (f.type === 'logical') { def.type = 'toggle'; def.sample = 'yes'; }
      else { def.type = f.type === 'date' ? 'date' : f.type === 'integer' || f.type === 'decimal' ? 'number' : 'text'; def.sample = sampleFor(f.name, f.type); }
      if (def.type !== 'linked' && def.type !== 'computed' && !/Generated|Set by/.test(def.note || '')) { let bs = 0; pr.stages.forEach((st, i) => { const sc = overlap(fw, stageWords(st)); if (i !== hi && sc > bs && i >= hi) { bs = sc; target = i; } }); }
      if (def.type === 'computed') { const li = lists.findIndex(Boolean); if (li >= 0) target = li; def.from = lists[li] ? lists[li].k : null; }
      fieldsByStage[target]!.push(def);
      if (def.type !== 'computed') stateSample[k] = def.type === 'system' && /Stamped/.test(def.note || '') ? '' : def.sample;
    }
  }
  for (let i = 0; i < fieldsByStage.length; i++) for (const d of fieldsByStage[i]!.slice()) if (d.type === 'computed' && !d.from) { const li = lists.findIndex(Boolean); if (li >= 0) { d.from = lists[li].k; fieldsByStage[i]!.splice(fieldsByStage[i]!.indexOf(d), 1); fieldsByStage[li]!.push(d); } }
  const allFields = fieldsByStage.flat();
  const reqText = pr.stages.map((st) => (st.req && g.requirements[st.req] ? g.requirements[st.req]!.body : '')).join('\n') + Object.values(g.requirements).filter((r) => r.kind === 'brule').map((r) => r.body).join('\n');
  const ruleCodes = [...new Set(pr.stages.flatMap((st) => st.rules))];
  const ruleFieldNames = new Set(ruleCodes.flatMap((c) => (M.ruleInfo[c] || { fails: [] }).fails.map((x: any) => x.field)));
  for (const d of allFields) if (['text', 'date', 'number', 'select'].includes(d.type) && (new RegExp('\\b' + d.field + '\\b').test(reqText) || ruleFieldNames.has(d.field))) d.required = true;
  for (const d of allFields) if (d.type === 'computed' && d.from) { const li = lists.find((l) => l && l.k === d.from); d.sample = li ? li.options.filter((o: any) => li.sample.includes(o.v)).reduce((a: number, o: any) => a + (o.amt || 0), 0).toFixed(2) : ''; stateSample[d.k] = d.sample; }

  const listFor = (name: string) => lists.find((l) => l && (norm(l.label) === norm(name) || norm(l.cat) + 's' === norm(name) || norm(l.table) === norm(name)));
  const checks = ruleCodes.map((code) => {
    const info = M.ruleInfo[code] || { desc: g.rulecodes[code] ? g.rulecodes[code]!.impl : code, fails: [] };
    const conds: any[] = [];
    for (const fname of [...new Set<string>(info.fails.map((x: any) => x.field))]) {
      const exact = allFields.filter((d) => d.field === fname && d.type !== 'computed');
      const lst = listFor(fname);
      const failMsg = (info.fails.find((x: any) => x.field === fname) || {}).msg;
      if (lst) conds.push({ t: 'list', k: lst.k, msg: failMsg });
      else if (tables[fname]) conds.push({ t: 'all', keys: allFields.filter((d) => d.table === fname && d.required).map((d) => d.k), msg: failMsg });
      else if (exact.length) {
        const d = exact[0];
        if (d.type === 'system' && d.options) { conds.push({ t: 'eq', k: d.k, v: d.options[0], msg: failMsg }); continue; }
        if (d.type === 'linked') { conds.push({ t: 'any', keys: allFields.filter((x) => x.table === d.target && x.type !== 'system').map((x) => x.k), msg: failMsg }); continue; }
        const msgs = info.fails.filter((x: any) => x.field === fname);
        const ranges = msgs.map((x: any) => { const r = x.msg.match(/between (\d+) and (\d+)/i); if (!r) return null; const when = allFields.filter((o) => o.type === 'select' && o.options).map((o) => ({ k: o.k, vals: o.options.map((op: any) => op.v || op).filter((v: string) => norm(x.msg).includes(norm(v)) || (norm(v).length > 4 && norm(x.msg).includes(norm(v).slice(0, 6)))) })).find((o) => o.vals.length); return { min: +r[1], max: +r[2], msg: x.msg, when: when || null }; }).filter(Boolean);
        conds.push({ t: 'filled', k: d.k, msg: msgs[0] ? msgs[0].msg : `${d.label} is required.`, ranges });
      }
    }
    return { code, text: info.desc || (g.rulecodes[code] || {}).title || code, conds };
  });

  const allowedRoles = (st: any) => [...new Set(st.files.flatMap((p: string) => M.roleChecks[p] || []))] as string[];
  const valIdx = pr.stages.findIndex((st) => stageKind(st) === 'validate');
  const phaseOf = (st: any, i: number) => (i === 0 ? 0 : stageKind(st) === 'validate' ? 2 : stageKind(st) === 'action' ? 3 : 1);
  const phases = ['Start', 'Capture', 'Check', 'Complete'];
  const headDate = g.meta.head_date ? new Date(g.meta.head_date) : new Date(opt.generatedAt ?? Date.now());
  const sampleLabel = (d: any) => { if (!d) return ''; const v = stateSample[d.k]; if (d.options) { const o = d.options.find((o: any) => (o.v || o) === v); return o ? (o.l || o) : v; } return v; };

  const steps = pr.stages.map((st, i) => {
    const kind = stageKind(st), req = st.req && g.requirements[st.req];
    const fields = fieldsByStage[i]!, list = lists[i];
    const stTests = [...new Set(st.files.flatMap((p) => (g.files[p] || { tested_by: [] }).tested_by))];
    const commits = g.commits.filter((c) => !c.bulk && c.files.some((x) => st.files.includes(x.path)));
    const inc = incidentsForStage(g, st);
    const recent = commits.filter((c) => (headDate.getTime() - new Date(c.date).getTime()) / 864e5 <= 30).pop();
    const badge = recent ? ['Changed', `${recent.subject}${ticketOf(g, recent.id) ? ` (${ticketOf(g, recent.id)!.id})` : ''}`] : null;
    const rules: [string, string][] = [];
    const later = valIdx > i;
    for (const code of st.rules) { const info = M.ruleInfo[code]; rules.push([kind === 'form' ? 'rule' : 'gate', `${code}: ${info ? info.desc : (g.rulecodes[code] || {}).title || ''}${kind === 'form' && later ? ' Checked when the application is validated.' : ''}`]); }
    const written = [...new Set(fields.filter((d) => d.type !== 'linked' && d.type !== 'computed').map((d) => d.table))];
    for (const t of written) { const user = fields.filter((d) => d.table === t && d.type !== 'system' && d.type !== 'linked').map((d) => d.label); rules.push(['data', user.length ? `Saved to the ${t} table: ${user.join(', ')}.` : `Stamps ${fields.filter((d) => d.table === t).map((d) => d.label.toLowerCase()).join(', ')} on the ${t} record.`]); }
    if (list) rules.push(['data', `Each ${titleCase(list.cat).toLowerCase()} chosen is saved to ${list.table}${list.amtLabel ? ` with its ${list.amtLabel.toLowerCase()}` : ''}.`]);
    for (const d of fields.filter((d) => d.type === 'linked')) rules.push(['data', `${d.label} links this record to the ${titleCase(d.target).toLowerCase()} captured in an earlier step.`]);
    const roles = allowedRoles(st);
    if (roles.length) rules.push(['gate', `Only ${roles.map((r) => titleCase(r.toLowerCase())).join(' or ')} users can do this.`]);
    if (kind === 'action' && valIdx >= 0 && valIdx < i) rules.push(['gate', "Only an application that passed validation, and hasn't changed since, can go through."]);
    for (const x of inc) rules.push(['q', `${x.id}: ${x.title}${x.status ? ` (${x.status})` : ''}.`]);
    let screen: any;
    if (kind === 'validate') screen = { kind, title: st.name, checks };
    else if (kind === 'action') {
      const sk = Object.values(statusKeys)[0];
      const statusDef = allFields.find((d) => d.k === sk);
      const opts: string[] = statusDef ? statusDef.options : [];
      const sw7 = stageWords(st); const to = opts.find((o) => sw7.some((w) => stemMatch(w, o.toLowerCase().replace(/[^a-z]/g, '')))) || opts.find((o) => /FORCE|ACTIVE|APPROVED|ISSUED|COMPLETE/i.test(o)) || opts[1] || 'DONE';
      screen = { kind, title: st.name, fields, action: { label: st.name, roles, statusKey: sk || null, from: opts[0] || null, to, needsValidation: valIdx >= 0 && valIdx < i } };
    } else screen = { kind: 'form', title: st.name, fields, list };
    const chips: [string, string][] = [];
    const named = fields.filter((d) => ['text', 'select', 'number', 'date'].includes(d.type));
    const nameish = named.filter((d) => /^(first)?name$|^surname$|^lastname$/i.test(d.field));
    for (const d of fields) if (d.type === 'system' && /Generated/.test(d.note || '')) { const nm = nameish.filter((x) => x.table === d.table); chips.push([d.table, nm.length ? `${titleCase(d.table)} ${nm.map((x) => stateSample[x.k]).join(' ')} (${d.sample})` : `${titleCase(d.table)} ${d.sample}${statusKeys[d.table] ? ', ' + stateSample[statusKeys[d.table]!] : ''}`]); }
    for (const t of [...new Set(nameish.map((x) => x.table))]) if (!chips.some((c) => c[0] === t)) chips.push([t, `${titleCase(t)} ${nameish.filter((x) => x.table === t).map((x) => stateSample[x.k]).join(' ')}`]);
    for (const d of named.filter((d) => d.type === 'select').slice(0, 2)) chips.push([d.k, `${d.label}: ${sampleLabel(d)}`]);
    if (list) { const tot = fieldsByStage.flat().find((d) => d.type === 'computed' && d.from === list.k); chips.push([list.k, `${list.label}: ${list.options.filter((o: any) => list.sample.includes(o.v)).map((o: any) => o.code).join(', ')}${tot ? ` (R ${tot.sample})` : ''}`]); }
    if (named.length && !named.some((d) => d.type === 'select') && !nameish.length) chips.push([named[0].table, `${titleCase(named[0].table)}: ${named.filter((d) => d.required).concat(named).slice(0, 2).map((d) => sampleLabel(d)).join(', ')}`]);
    if (kind === 'validate') chips.push(['validation', `Validation passed, ${checks.length} rules`]);
    if (kind === 'action' && screen.action.statusKey) chips.push(['status', `Status ${screen.action.to}`]);
    const say = req && req.body ? prettyBody(req.body).split(/(?<=\.)\s/).slice(0, 3).join(' ') : kind === 'validate' ? 'Every business rule is checked against the application before it can go further.' : `This step captures ${fields.filter((d) => d.type !== 'system').map((d) => d.label.toLowerCase()).slice(0, 4).join(', ') || 'the details for ' + st.name.toLowerCase()}.`;
    return {
      n: String(i + 1).padStart(2, '0'), ph: phaseOf(st, i), key: `s${i + 1}`, title: st.name, say, badge, rules, chips, screen,
      trace: { req: st.req || null, reqTitle: req ? req.title : null, rules: st.rules, files: st.files, tables: st.tables, tests: stTests },
      history: { changes: commits.map((c) => ({ id: c.id, date: String(c.date).slice(0, 10), subject: c.subject, ticket: (ticketOf(g, c.id) || {}).id || null })), incidents: inc.map((x) => ({ id: x.id, title: x.title, status: x.status, sev: x.sev, root: x.root })) },
    };
  });
  const usedPh = [...new Set(steps.map((s) => s.ph))].sort();
  steps.forEach((s) => { s.ph = usedPh.indexOf(s.ph); });
  const openQ = [...new Set(steps.flatMap((s) => s.rules.filter((r) => r[0] === 'q').map((r) => r[1])))];
  const spec: any = {
    kind: 'lens-process-spec', version: 1, title: pr.name, source: opt.source, vertical: opt.vertical, commit: g.meta.head, commitDate: g.meta.head_date,
    generated: opt.generatedAt ?? new Date().toISOString(), brand: VERT_COLOURS[opt.vertical] || '#0A5BC4', phases: usedPh.map((p) => phases[p]),
    roles: M.roles, defaultRole: M.roles[0] || null, steps, sample: stateSample, openQuestions: openQ,
    intro: `${pr.name} in ${opt.source} (${opt.vertical}), generated from the code at commit ${g.meta.head || 'unknown'}. Screens, rules and data come from the code; sample values are made up.`,
  };
  if (opt.override?.steps) { applyOverride(spec, opt.override.steps); spec.refined = true; }
  return spec;
}

/** Prototype override merge: wording fields only. See refine.ts for the fact-preservation guard applied before storage. */
export function applyOverride(spec: any, steps: any[]) {
  for (const o of steps) {
    const s = spec.steps.find((x: any) => +x.n === +o.n); if (!s) continue;
    if (o.title) s.title = o.title;
    if (o.say) s.say = o.say;
    if (Array.isArray(o.rules) && o.rules.length) s.rules = o.rules.filter((r: any) => Array.isArray(r) && r.length === 2);
    if (Array.isArray(o.chips) && o.chips.length) s.chips = o.chips.filter((c: any) => Array.isArray(c) && c.length === 2);
  }
}
