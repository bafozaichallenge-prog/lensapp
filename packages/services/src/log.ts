/** Structured JSON logging (plan §23.2). Secrets and prompt contents must never be logged; this redacts as a safety net. */
const SECRET_KEY = /pass(word)?|secret|token|authorization|api[_-]?key|cookie|prompt|credential/i;
const SECRET_VALUE = /\b(glpat-[A-Za-z0-9_-]{8,}|sk-ant-[A-Za-z0-9_-]{8,}|AKIA[0-9A-Z]{16}|Bearer\s+[A-Za-z0-9._-]{16,})/g;

export function redactForLog(v: unknown, depth = 0): unknown {
  if (v == null || depth > 6) return v;
  if (typeof v === 'string') return v.replace(SECRET_VALUE, '[redacted]');
  if (Array.isArray(v)) return v.map((x) => redactForLog(x, depth + 1));
  if (v instanceof Error) return { name: v.name, message: String(redactForLog(v.message, depth + 1)) };
  if (typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, SECRET_KEY.test(k) ? '[redacted]' : redactForLog(x, depth + 1)]));
  return v;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface Logger { log(level: LogLevel, msg: string, fields?: Record<string, unknown>): void }

export function jsonLogger(write: (line: string) => void = (l) => process.stdout.write(l + '\n'), base: Record<string, unknown> = {}): Logger {
  return { log(level, msg, fields = {}) { write(JSON.stringify({ time: new Date().toISOString(), level, msg: redactForLog(msg), ...base, ...(redactForLog(fields) as object) })); } };
}
