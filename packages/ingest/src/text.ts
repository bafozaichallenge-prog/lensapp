/** Decode bytes: UTF-8 if valid, else Windows-1252 (common for ABL sources). Normalise newlines, drop BOM. */
export function decodeSource(buf: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    text = new TextDecoder('windows-1252').decode(buf);
  }
  return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

/**
 * Blank out ABL comments (block comments (the first closing marker ends the comment; not nested) and // line comments) and string
 * literal contents, preserving offsets and newlines. Structural regexes run on the
 * result so commented-out code and text in strings never create edges.
 */
export function stripAbl(src: string, opts: { keepStrings?: boolean } = {}): string {
  const out: string[] = [];
  let i = 0, depth = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!, d = src[i + 1];
    if (depth > 0) {
      // Not nested: the first closing marker ends the comment. Real headers contain "schema/*.df" and would otherwise swallow the file.
      if (c === '*' && d === '/') { depth = 0; out.push('  '); i += 2; }
      else { out.push(c === '\n' ? '\n' : ' '); i++; }
      continue;
    }
    if (c === '/' && d === '*') { depth = 1; out.push('  '); i += 2; continue; }
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') { out.push(' '); i++; }
      continue;
    }
    if (c === '"' || c === "'") {
      out.push(c); i++;
      while (i < n && src[i] !== c && src[i] !== '\n') {
        if (src[i] === '~' && i + 1 < n) { out.push(opts.keepStrings ? src[i]! : ' '); i++; }
        out.push(opts.keepStrings ? src[i]! : ' '); i++;
      }
      if (i < n && src[i] === c) { out.push(c); i++; }
      continue;
    }
    out.push(c); i++;
  }
  return out.join('');
}

/** Prototype LOC: every line, including blank ones (`text.split("\n").length`). */
export const countLoc = (text: string) => text.split('\n').length;

export const baseName = (p: string) => p.slice(p.lastIndexOf('/') + 1);
export const ext = (p: string) => {
  const b = baseName(p), i = b.lastIndexOf('.');
  return i < 0 ? '' : b.slice(i).toLowerCase();
};

/** Prototype camelWords(): split camelCase / acronyms into lowercase words, dropping the file extension. */
export const camelWords = (n: string): string[] =>
  (n || '').replace(/\.(cls|p|i|w)$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** Purpose text from a file header: "Purpose:|Description:|Covers:" paragraph, else the header minus its first line. */
export function purposeOf(header: string | undefined): string {
  if (!header) return '';
  const m = header.match(/(?:Purpose|Description|Covers):\s*([\s\S]*?)(?:\n\s*\n|\n[A-Z][\w ]{2,18}:|$)/);
  return (m ? m[1]! : header.split('\n').slice(1).join(' ')).replace(/\s+/g, ' ').trim();
}

/** Longest shared directory prefix of code/schema files, keeping src/tests/database/include roots visible (prototype stripPrefix). */
export function commonPrefix(paths: string[]): string {
  const dirs = paths.filter((p) => /\.(cls|p|i|w|df)$/i.test(p)).map((p) => p.split('/').slice(0, -1));
  if (!dirs.length) return '';
  let pre = dirs[0]!.slice();
  for (const d of dirs) { let k = 0; while (k < pre.length && k < d.length && pre[k] === d[k]) k++; pre = pre.slice(0, k); }
  while (pre.length && ['src', 'tests', 'database', 'include'].includes(pre[pre.length - 1]!)) pre.pop();
  return pre.length ? pre.join('/') + '/' : '';
}

/** Layer from a prefix-stripped path (prototype rules). */
export function layerOf(rel: string, isDoc = false): string {
  if (isDoc) return 'docs';
  const parts = rel.split('/');
  if (parts[0] === 'src') return parts.length > 2 ? parts[1]! : 'root';
  if (parts[0] === 'tests' || /test/i.test(parts[0]!)) return 'tests';
  return parts.length > 1 ? parts[0]! : 'root';
}
