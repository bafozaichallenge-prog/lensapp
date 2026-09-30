/** CSV import helpers (plan §11): PII column detection and suffix-based path resolution. */

const PII_HEADER = /(^|[^a-z])(id[\s_-]?(no|number|num)|national[\s_-]?id|passport|phone|mobile|cell|tel(ephone)?|e-?mail|email|address|dob|birth|surname|first[\s_-]?name|full[\s_-]?name|customer[\s_-]?name|member[\s_-]?name)([^a-z]|$)/i;
// Values are free text ("call 082 123 4567, mail a@b.co"), so patterns are searched for inside them.
const EMAIL = /[^\s@,;]+@[^\s@,;]+\.[A-Za-z]{2,}/;
const PHONE = /(?<![\d.])(?:\+27|0)[\s-]?[1-9]\d[\s-]?\d{3}[\s-]?\d{4}(?![\d.])/;
const SA_ID_CANDIDATE = /(?<!\d)(\d{2})(\d{2})(\d{2})\d{4}[01]\d{2}(?!\d)/;
const validSaId = (v: string) => { const m = v.match(SA_ID_CANDIDATE); if (!m) return false; const mo = +m[2]!, d = +m[3]!; return mo >= 1 && mo <= 12 && d >= 1 && d <= 31; };

export interface PiiFinding { column: string; reason: 'header' | 'email' | 'phone' | 'id-number' }

/** Flags columns whose header or values look like personal data. Columns are dropped by default. */
export function detectPersonalData(headers: string[], rows: Record<string, string>[]): PiiFinding[] {
  const out: PiiFinding[] = [];
  for (const h of headers) {
    if (PII_HEADER.test(h)) { out.push({ column: h, reason: 'header' }); continue; }
    const vals = rows.map((r) => (r[h] ?? '').trim()).filter(Boolean).slice(0, 200);
    if (!vals.length) continue;
    const fracFn = (f: (v: string) => boolean) => vals.filter(f).length / vals.length;
    if (fracFn((v) => EMAIL.test(v)) >= 0.3) out.push({ column: h, reason: 'email' });
    else if (fracFn(validSaId) >= 0.3) out.push({ column: h, reason: 'id-number' });
    else if (fracFn((v) => PHONE.test(v)) >= 0.3) out.push({ column: h, reason: 'phone' });
  }
  return out;
}

/** Drop flagged columns unless an Admin explicitly retains them. */
export function dropPersonalData<T extends Record<string, string>>(rows: T[], findings: PiiFinding[], retain: string[] = []): Record<string, string>[] {
  const drop = new Set(findings.map((f) => f.column).filter((c) => !retain.includes(c)));
  return rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !drop.has(k))));
}

export interface PathResolution { input: string; resolved?: string; ambiguous?: string[] }

/** Resolve incident program/file names against source paths using suffix matching. Unresolved ones are reported. */
export function resolvePaths(inputs: string[], paths: string[]): PathResolution[] {
  const lower = paths.map((p) => ({ p, l: p.toLowerCase() }));
  return inputs.map((input) => {
    const norm = input.trim().replace(/\\/g, '/').replace(/^\.?\//, '').toLowerCase();
    if (!norm) return { input };
    let hits = lower.filter((x) => x.l === norm || x.l.endsWith('/' + norm));
    if (!hits.length && !/\.[a-z]+$/.test(norm)) hits = lower.filter((x) => /\.(p|w|i|cls)$/.test(x.l) && (x.l.endsWith('/' + norm + x.l.slice(x.l.lastIndexOf('.'))) || x.l.replace(/\.[a-z]+$/, '') === norm || x.l.replace(/\.[a-z]+$/, '').endsWith('/' + norm)));
    if (hits.length === 1) return { input, resolved: hits[0]!.p };
    if (hits.length > 1) return { input, ambiguous: hits.map((h) => h.p).sort() };
    return { input };
  });
}

/** Split a multi-value programs cell ("a.p; b.cls, c.w"). */
export const splitPrograms = (cell: string) => cell.split(/[;,|\n]/).map((s) => s.trim()).filter(Boolean);
