import { detectPersonalData, parseCsv, resolvePaths, splitList, type PiiFinding } from '@lens/ingest';
import { can } from '@lens/core';
import { audit } from './audit';
import { badRequest, forbidden, type Actor, type Ctx } from './context';
import { requireSource } from './access';
import { refreshLinks } from './overlays';

export type ImportKind = 'tickets' | 'incidents';
export type ColumnMap = Record<string, string>;

export const FIELDS: Record<ImportKind, { field: string; required: boolean; aliases: string[] }[]> = {
  tickets: [
    { field: 'key', required: true, aliases: ['id', 'key', 'ticket', 'issue'] },
    { field: 'title', required: true, aliases: ['title', 'summary'] },
    { field: 'taskmanager', required: false, aliases: ['tm', 'taskmanager', 'task', 'tasknumber'] },
    { field: 'type', required: false, aliases: ['type', 'issuetype'] },
    { field: 'status', required: false, aliases: ['status'] },
    { field: 'note', required: false, aliases: ['tm_note', 'note', 'comment', 'comments', 'description'] },
    { field: 'reqs', required: false, aliases: ['reqs', 'requirements'] },
    { field: 'commit', required: false, aliases: ['commit', 'hash', 'commit_id'] },
  ],
  incidents: [
    { field: 'key', required: true, aliases: ['id', 'key', 'incident'] },
    { field: 'title', required: true, aliases: ['title', 'summary'] },
    { field: 'files', required: true, aliases: ['files', 'components', 'programs'] },
    { field: 'severity', required: false, aliases: ['sev', 'severity', 'priority'] },
    { field: 'date', required: false, aliases: ['date', 'opened', 'created'] },
    { field: 'symptom', required: false, aliases: ['symptom', 'description', 'impact'] },
    { field: 'rootCause', required: false, aliases: ['root', 'rootcause', 'cause'] },
    { field: 'reqs', required: false, aliases: ['reqs', 'requirements'] },
    { field: 'fixTicket', required: false, aliases: ['fix', 'fixedby', 'ticket', 'resolution_ticket'] },
    { field: 'status', required: false, aliases: ['status'] },
    { field: 'residual', required: false, aliases: ['residual', 'notes', 'followup'] },
  ],
};

const norm = (s: string) => s.replace(/[^a-z]/g, '');

/** Suggest a column mapping from header names (same aliases the prototype used). */
export function suggestMapping(kind: ImportKind, headers: string[]): ColumnMap {
  const out: ColumnMap = {};
  for (const f of FIELDS[kind]) {
    const hit = f.aliases.map((a) => headers.find((h) => h === a || norm(h) === norm(a))).find(Boolean);
    if (hit) out[f.field] = hit;
  }
  return out;
}

export interface ImportPreview { headers: string[]; mapping: ColumnMap; missingRequired: string[]; personalData: PiiFinding[]; sample: Record<string, string>[]; rows: number }

/** Step 1 of the import UI: show columns, the (saved or suggested) mapping, and any personal-data columns that will be dropped. */
export async function previewImport(ctx: Ctx, actor: Actor, sourceId: string, kind: ImportKind, csv: string): Promise<ImportPreview> {
  await requireSource(ctx, actor, 'import.run', sourceId);
  const { headers, rows } = parseCsv(csv);
  const saved = await ctx.db.importMapping.findUnique({ where: { sourceId_kind: { sourceId, kind } } });
  const savedMap = (saved?.columnMapJson as ColumnMap | undefined) ?? {};
  const mapping = Object.fromEntries(Object.entries({ ...suggestMapping(kind, headers), ...Object.fromEntries(Object.entries(savedMap).filter(([, h]) => headers.includes(h))) }));
  return { headers, mapping, missingRequired: FIELDS[kind].filter((f) => f.required && !mapping[f.field]).map((f) => f.field), personalData: detectPersonalData(headers, rows), sample: rows.slice(0, 5), rows: rows.length };
}

export interface ImportReport {
  created: number; updated: number; skipped: number;
  droppedColumns: string[];
  retainedColumns: string[];
  unresolvedPaths: { incident: string; path: string }[];
  ambiguousPaths: { incident: string; path: string; candidates: string[] }[];
}

/**
 * Import tickets or incidents (Maintainer+). Personal-data columns are dropped unless an Admin explicitly retains them.
 * Incident paths are resolved against the active snapshot by suffix and unresolved ones are reported for correction.
 */
export async function runImport(ctx: Ctx, actor: Actor, sourceId: string, kind: ImportKind, csv: string, mapping: ColumnMap, opts: { retainColumns?: string[] } = {}): Promise<ImportReport> {
  await requireSource(ctx, actor, 'import.run', sourceId);
  const { headers, rows } = parseCsv(csv);
  for (const h of Object.values(mapping)) if (!headers.includes(h)) throw badRequest(`Column "${h}" is not in the file.`);
  const pii = detectPersonalData(headers, rows);
  const retain = opts.retainColumns ?? [];
  if (retain.length && !can('import.allowPersonalData', { role: actor.role, canSeeSource: true })) throw forbidden('Only an Admin can retain personal-data columns.');
  const retained = pii.map((p) => p.column).filter((c) => retain.includes(c));
  const dropped = pii.map((p) => p.column).filter((c) => !retain.includes(c));
  const usable: ColumnMap = Object.fromEntries(Object.entries(mapping).filter(([, h]) => !dropped.includes(h)));
  const missing = FIELDS[kind].filter((f) => f.required && !usable[f.field]).map((f) => f.field);
  if (missing.length) {
    const blocked = FIELDS[kind].filter((f) => f.required && mapping[f.field] && dropped.includes(mapping[f.field]!)).map((f) => f.field);
    throw badRequest(`Missing required column(s): ${missing.join(', ')}${blocked.length ? ` (${blocked.join(', ')} looked like personal data and was dropped; map a different column)` : ''}.`);
  }
  const get = (r: Record<string, string>, f: string) => (usable[f] ? r[usable[f]!] ?? '' : '');
  const report: ImportReport = { created: 0, updated: 0, skipped: 0, droppedColumns: dropped, retainedColumns: retained, unresolvedPaths: [], ambiguousPaths: [] };
  const snap = await ctx.db.graphSnapshot.findFirst({ where: { sourceId, status: 'ACTIVE' }, select: { id: true } });
  const paths = snap ? (await ctx.db.file.findMany({ where: { snapshotId: snap.id }, select: { path: true } })).map((f) => f.path) : [];

  for (const r of rows) {
    const key = get(r, 'key').trim();
    if (!key) { report.skipped++; continue; }
    if (kind === 'tickets') {
      const data = { taskmanager: get(r, 'taskmanager') || null, type: get(r, 'type') || 'Ticket', title: get(r, 'title'), status: get(r, 'status') || null, note: get(r, 'note') || null, reqs: splitList(get(r, 'reqs')), commitRef: get(r, 'commit') || null };
      const ex = await ctx.db.ticket.findUnique({ where: { sourceId_key: { sourceId, key } } });
      if (ex) await ctx.db.ticket.update({ where: { id: ex.id }, data }); else await ctx.db.ticket.create({ data: { sourceId, key, ...data } });
      ex ? report.updated++ : report.created++;
    } else {
      const files = splitList(get(r, 'files'));
      const res = resolvePaths(files, paths);
      const data = { severity: get(r, 'severity') || null, date: get(r, 'date') || null, title: get(r, 'title'), symptom: get(r, 'symptom') || null, rootCause: get(r, 'rootCause') || null, status: get(r, 'status') || null, fixTicket: get(r, 'fixTicket') || null, residual: get(r, 'residual') || null, reqs: splitList(get(r, 'reqs')) };
      const ex = await ctx.db.incident.findUnique({ where: { sourceId_key: { sourceId, key } } });
      const inc = ex ? await ctx.db.incident.update({ where: { id: ex.id }, data }) : await ctx.db.incident.create({ data: { sourceId, key, ...data } });
      await ctx.db.incidentFile.deleteMany({ where: { incidentId: inc.id } });
      await ctx.db.incidentFile.createMany({ data: files.map((path, i) => ({ incidentId: inc.id, path, resolvedPath: res[i]!.resolved ?? null, ambiguous: res[i]!.ambiguous ?? [] })) });
      res.forEach((x) => { if (x.ambiguous) report.ambiguousPaths.push({ incident: key, path: x.input, candidates: x.ambiguous }); else if (!x.resolved) report.unresolvedPaths.push({ incident: key, path: x.input }); });
      ex ? report.updated++ : report.created++;
    }
  }
  await ctx.db.importMapping.upsert({ where: { sourceId_kind: { sourceId, kind } }, create: { sourceId, kind, columnMapJson: usable, createdBy: actor.id }, update: { columnMapJson: usable, createdBy: actor.id } });
  if (snap) await refreshLinks(ctx, sourceId, snap.id);
  await audit(ctx, actor.id, 'import.run', { type: 'source', id: sourceId }, { kind, ...report, unresolvedPaths: report.unresolvedPaths.length, ambiguousPaths: report.ambiguousPaths.length });
  return report;
}

/** Incident file references that did not resolve, so users can correct them (plan §11). */
export async function unresolvedIncidentFiles(ctx: Ctx, actor: Actor, sourceId: string) {
  await requireSource(ctx, actor, 'source.view', sourceId);
  const rows = await ctx.db.incidentFile.findMany({ where: { resolvedPath: null, incident: { sourceId } }, include: { incident: { select: { key: true, title: true } } } });
  return rows.map((r) => ({ incident: r.incident.key, title: r.incident.title, path: r.path, candidates: r.ambiguous }));
}
