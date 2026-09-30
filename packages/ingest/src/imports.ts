/** CSV import helpers (plan §11): PII column detection and suffix-based path resolution. */

const PII_HEADER = /(^|[^a-z])(id[\s_-]?(no|number|num)|national[\s_-]?id|passport|phone|mobile|cell|tel(ephone)?|e-?mail|email|address|dob|birth|surname|first[\s_-]?name|full[\s_-]?name|customer[\s_-]?name|member[\s_-]?name)([^a-z]|$)/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?\d[\d\s().-]{8,14}\d$/;
const SA_ID = /^\d{13}$/;

export interface PiiFinding { column: string; reason: 'header' | 'email' | 'phone' | 'id-number' }

/** Flags columns whose header or values look like personal data. Columns are dropped by default. */
export function detectPersonalData(headers: string[], rows: Record<string, string>[]): PiiFinding[] {
  const out: PiiFinding[] = [];
  for (const h of headers) {
    if (PII_HEADER.test(h)) { out.push({ column: h, reason: 'header' }); continue; }
    const vals = rows.map((r) => (r[h] ?? '').trim()).filter(Boolean).slice(0, 200);
    if (!vals.length) continue;
    const frac = (re: RegExp) => vals.filter((v) => re.test(v)).length / vals.length;
    if (frac(EMAIL) >= 0.3) out.push({ column: h, reason: 'email' });
    else if (frac(SA_ID) >= 0.3) out.push({ column: h, reason: 'id-number' });
    else if (frac(PHONE) >= 0.3) out.push({ column: h, reason: 'phone' });
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
