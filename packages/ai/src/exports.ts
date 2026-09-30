import { csvRow } from '@lens/core';
import type { Analysis } from './schema';

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'change';

const AUD: [keyof Analysis['plan'], string][] = [['business', 'business analysts'], ['developer', 'developers'], ['qa', 'QA'], ['architect', 'architects']];

/** Jira-import CSV (prototype columns). Cells that could execute as spreadsheet formulas are neutralised. */
export function tasksCsv(projectName: string, a: Analysis): string {
  const rows: unknown[][] = [['Summary', 'Issue Type', 'Description', 'Labels', 'Priority', 'Log in', 'Owner', 'Depends on', 'Lens id']];
  for (const t of a.tasks) rows.push([
    t.title, t.type || 'Task',
    [t.description, t.acceptance.length ? 'Done when:\n' + t.acceptance.map((x) => '- ' + x).join('\n') : '', t.files.length ? 'Files: ' + t.files.join(', ') : '', t.step ? 'Process step: ' + t.step : ''].filter(Boolean).join('\n\n'),
    ['lens', slugify(projectName)].join(' '), t.priority || 'Medium', t.system, t.owner, t.depends_on.join(' '), t.id,
  ]);
  return rows.map(csvRow).join('\n');
}

/** ABLUnit snippets as one .cls-style file (prototype download). */
export const testsCls = (a: Analysis) => a.tests.map((t) => `/* ${t.file}: ${t.purpose} */\n${t.code}\n`).join('\n');

export interface PlanMeta { name: string; description?: string; source: string; sha?: string; snapshotId?: string | number; model?: string; promptVersion?: string; created?: string }

/** Complete Markdown plan (prototype planMarkdown) with the provenance block the plan requires (§3.3). */
export function planMarkdown(meta: PlanMeta, a: Analysis): string {
  const L: string[] = [`# ${meta.name}`, '', meta.description ? `> ${meta.description}` : '', '',
    `System: ${meta.source}${meta.sha ? ` at ${meta.sha.slice(0, 7)}` : ''}`,
    `Analysis: ${[meta.model, meta.promptVersion, meta.snapshotId != null ? `snapshot ${meta.snapshotId}` : '', meta.created].filter(Boolean).join(' · ')}`, ''];
  L.push('## Summary', '', a.summary.business, '', a.summary.technical, '', '## Questions to settle first', '', ...a.questions.map((q, i) => `${i + 1}. ${q}`), '');
  for (const p of a.processes) L.push(`## Process impact: ${p.process}`, '',
    ...p.stages.filter((x) => x.change !== 'none' || x.note).map((x) => `- Step ${x.n}: ${x.change}${x.note ? '. ' + x.note : ''}`),
    ...p.new_stages.map((n) => `- New step after ${n.after}: ${n.name}. ${n.note ?? ''}`), '');
  L.push('## Risks', '', ...a.risks.flatMap((r) => [`### ${r.severity.toUpperCase()}: ${r.title}`, '', r.why, '', r.mitigation ? `Mitigation: ${r.mitigation}` : '', `Evidence: ${r.evidence.join(', ')}`, '']));
  for (const [k, l] of AUD) { L.push(`## Plan for ${l}`, ''); a.plan[k].forEach((st, i) => L.push(`${i + 1}. **${st.title}**: ${st.detail}${st.files?.length ? ' (' + st.files.join(', ') + ')' : ''}`)); L.push(''); }
  if (a.tasks.length) L.push('## Tasks to log', '', '| # | Log in | Type | Task | Owner | Depends on |', '|---|---|---|---|---|---|',
    ...a.tasks.map((t) => `| ${t.id} | ${t.system} | ${t.type} | ${t.title.replace(/\|/g, '/')} | ${t.owner} | ${t.depends_on.join(', ')} |`), '');
  L.push('## What changes', '', '| Where | Change | Why |', '|---|---|---|', ...a.impact.map((x) => `| ${x.path} | ${x.change} | ${x.reason.replace(/\|/g, '/')} |`), '', '## Tests', '',
    ...a.tests.flatMap((t) => [`### ${t.name} (${t.file})`, '', t.purpose, '', '```abl', t.code, '```', '']));
  return L.join('\n');
}
