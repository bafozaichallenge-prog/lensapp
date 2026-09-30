/** AI data-minimisation policy (plan §22.6). Nothing in the "No" rows may reach a prompt. */
export const DATA_POLICY = [
  { data: 'Repository source code', ai: 'Only when relevant to the analysis' },
  { data: 'Requirements', ai: 'Relevant sections only' },
  { data: 'Client personal data', ai: 'No' },
  { data: 'Credentials / secrets', ai: 'No' },
  { data: 'Production DB extracts', ai: 'No' },
  { data: 'Imported operational history', ai: 'Relevant sections only' },
] as const;

interface Rule { type: string; re: RegExp; kind: 'secret' | 'personal' }
const RULES: Rule[] = [
  { type: 'private-key', kind: 'secret', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { type: 'gitlab-token', kind: 'secret', re: /\bglpat-[A-Za-z0-9_\-]{10,}\b/g },
  { type: 'anthropic-key', kind: 'secret', re: /\bsk-ant-[A-Za-z0-9_\-]{10,}\b/g },
  { type: 'aws-key', kind: 'secret', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { type: 'bearer-token', kind: 'secret', re: /\bBearer\s+[A-Za-z0-9._\-]{20,}\b/g },
  { type: 'credential-assignment', kind: 'secret', re: /\b(password|passwd|pwd|secret|api[_-]?key|token)\s*[:=]\s*["']?[^\s"',;]{6,}/gi },
  { type: 'email', kind: 'personal', re: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g },
  { type: 'sa-id-number', kind: 'personal', re: /\b\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{4}[01]\d{2}\b/g },
  { type: 'phone', kind: 'personal', re: /(?<![\d.])(?:\+27|0)[\s-]?[1-9]\d[\s-]?\d{3}[\s-]?\d{4}(?![\d.])/g },
];

export interface RedactionFinding { type: string; kind: 'secret' | 'personal'; count: number }

/** Replace secrets and personal data with [REDACTED:<type>] before any text is placed in a prompt. Sample data in fixtures is synthetic. */
export function redact(text: string): { text: string; findings: RedactionFinding[] } {
  const findings: RedactionFinding[] = [];
  let out = text;
  for (const r of RULES) {
    let n = 0;
    out = out.replace(r.re, () => { n++; return `[REDACTED:${r.type}]`; });
    if (n) findings.push({ type: r.type, kind: r.kind, count: n });
  }
  return { text: out, findings };
}
