import type { CommitInput } from '@lens/core';

export function parseNumstat(lines: string[]) {
  const out: { path: string; additions: number; deletions: number }[] = [];
  for (const l of lines) {
    const p = l.split('\t');
    if (p.length !== 3) continue;
    const path = p[2]!.replace(/\{[^}]*=> ([^}]*)\}/, '$1').replace(/\/\//g, '/').replace(/^.* => /, '');
    out.push({ path, additions: +p[0]! || 0, deletions: +p[1]! || 0 });
  }
  return out;
}

const MAINLINE = ['main', 'develop', 'master', 'origin/main'];

/**
 * Parses `@@short|full|author|iso-date|parents|subject` + numstat logs, and standard `git log --numstat` output.
 * Merge commits are used to name branches (second parent) then dropped, leaving non-merge commits (prototype behaviour).
 */
export function parseGitLog(text: string): CommitInput[] {
  const commits: (CommitInput & { short: string })[] = [];
  if (/^@@/m.test(text)) {
    for (const block of text.split(/^@@/m).slice(1)) {
      const lines = block.split('\n');
      const p = lines[0]!.split('|');
      if (p.length < 6) continue;
      const [short, full, author, date, parents] = p as [string, string, string, string, string];
      commits.push({ short, sha: full, author, date, parents: parents.split(' ').filter(Boolean), subject: p.slice(5).join('|').trim(), files: parseNumstat(lines.slice(1)) });
    }
  } else {
    for (const block of text.split(/^(?=commit [0-9a-f]{7,40})/m)) {
      const m = block.match(/^commit ([0-9a-f]{7,40})/);
      if (!m) continue;
      const lines = block.split('\n');
      const mg = block.match(/^Merge: (.+)$/m), au = block.match(/^Author:\s*(.+?)(?: <.*>)?$/m), dt = block.match(/^Date:\s*(.+)$/m);
      const msg = lines.filter((l) => /^ {4}/.test(l)).map((l) => l.trim());
      commits.push({
        short: m[1]!.slice(0, 7), sha: m[1]!, author: au?.[1] ?? '', date: dt ? new Date(dt[1]!.trim()).toISOString() : '',
        parents: mg ? mg[1]!.split(' ') : [], subject: msg[0] ?? '', files: parseNumstat(lines.filter((l) => /^\d+|^-\t/.test(l))),
      });
    }
  }
  const branchOf: Record<string, string> = {};
  for (const c of commits) {
    const m = c.subject.match(/^Merge (?:remote-tracking )?branch '([^']+)'/);
    if (m && c.parents.length === 2 && !MAINLINE.includes(m[1]!)) branchOf[c.parents[1]!] ||= m[1]!;
  }
  return commits.filter((c) => c.parents.length < 2).map(({ short, ...c }) => {
    const b = Object.entries(branchOf).find(([ph]) => ph.startsWith(short) || c.sha.startsWith(ph));
    return { ...c, branch: b ? b[1] : undefined };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

/** Ticket/incident references in a commit subject. Plan default is broad; resolve against known ticket keys to avoid false positives. */
export const DEFAULT_COMMIT_REF = /\b(TSK\d{5,}|[A-Z][A-Z0-9]+-\d+)\b/g;
export const commitRefs = (subject: string, pattern: RegExp = DEFAULT_COMMIT_REF): string[] =>
  [...new Set([...subject.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'))].map((m) => m[1] ?? m[0]))];
