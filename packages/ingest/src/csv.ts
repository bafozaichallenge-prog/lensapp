import Papa from 'papaparse';

/** Parse CSV to rows keyed by lower-cased, trimmed header (prototype parseCSV behaviour). */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' });
  const data = res.data as string[][];
  const headers = (data.shift() ?? []).map((h) => h.trim().toLowerCase());
  const rows = data.map((r) => Object.fromEntries(headers.map((k, i) => [k, (r[i] ?? '').trim()])));
  return { headers, rows };
}

/** Prototype pick(): first non-empty column whose normalised name matches one of the keys. */
export function pick(row: Record<string, string>, ...keys: string[]): string {
  const norm = (s: string) => s.replace(/[^a-z]/g, '');
  for (const k of keys) for (const kk of Object.keys(row)) if ((kk === k || norm(kk) === norm(k)) && row[kk]) return row[kk]!;
  return '';
}

export const splitList = (v: string): string[] =>
  String(v || '').split(/[;\n]|,\s*(?=[\w./-]+\.(?:cls|p|i|w)\b)/).map((x) => x.trim()).filter(Boolean);

export interface TicketRow { key: string; taskmanager: string; type: string; title: string; status: string; note: string; reqs: string[]; commitRef: string }
export interface IncidentRow { key: string; severity: string; date: string; title: string; symptom: string; rootCause: string; files: string[]; reqs: string[]; fixTicket: string | null; status: string; residual: string }

export function parseTickets(text: string): TicketRow[] {
  return parseCsv(text).rows.map((r) => ({
    key: pick(r, 'id', 'key', 'ticket', 'issue'), taskmanager: pick(r, 'tm', 'taskmanager', 'task', 'tasknumber'),
    type: pick(r, 'type', 'issuetype') || 'Ticket', title: pick(r, 'title', 'summary'), status: pick(r, 'status'),
    note: pick(r, 'tm_note', 'note', 'comment', 'comments', 'description'), reqs: splitList(pick(r, 'reqs', 'requirements')),
    commitRef: pick(r, 'commit', 'hash', 'commit_id'),
  })).filter((t) => t.key);
}

export function parseIncidents(text: string): IncidentRow[] {
  return parseCsv(text).rows.map((r) => ({
    key: pick(r, 'id', 'key', 'incident'), severity: pick(r, 'sev', 'severity', 'priority'), date: pick(r, 'date', 'opened', 'created'),
    title: pick(r, 'title', 'summary'), symptom: pick(r, 'symptom', 'description', 'impact'), rootCause: pick(r, 'root', 'rootcause', 'cause'),
    files: splitList(pick(r, 'files', 'components', 'programs')), reqs: splitList(pick(r, 'reqs', 'requirements')),
    fixTicket: pick(r, 'fix', 'fixedby', 'ticket', 'resolution_ticket') || null, status: pick(r, 'status'), residual: pick(r, 'residual', 'notes', 'followup'),
  })).filter((i) => i.key);
}

/** Link a ticket to a commit: explicit hash column first, else the ticket key/TM number in the subject (prototype). */
export function linkTicketCommit(t: TicketRow, commits: { sha: string; subject: string }[]): string | null {
  const c = t.commitRef
    ? commits.find((x) => x.sha.startsWith(t.commitRef) || t.commitRef.startsWith(x.sha.slice(0, 7)))
    : commits.find((x) => x.subject.includes(t.key) || (t.taskmanager && x.subject.includes(t.taskmanager)));
  return c ? c.sha : null;
}
