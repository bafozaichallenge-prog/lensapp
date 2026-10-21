// ABL-aware chunking. Deliberately regex-based: good enough to cut on
// PROCEDURE / FUNCTION / METHOD boundaries and pull out cross-references.
// It is a starting point, not a full ABL parser.

export interface Chunk {
  id: string;
  path: string;
  kind: 'procedure' | 'function' | 'method' | 'class' | 'main' | 'window';
  name: string;
  startLine: number;
  endLine: number;
  text: string;
  tables: string[];
  runs: string[];
  includes: string[];
}

const MAX_WINDOW = 80; // lines per fallback window

// PROCEDURE/FUNCTION: name follows the keyword. METHOD: [modifiers] <return type> name (
const PROC_START = /^\s*(PROCEDURE|FUNCTION)\s+([\w\-.]+)/i;
const METHOD_START = /^\s*(?:(?:PRIVATE|PUBLIC|PROTECTED|STATIC|OVERRIDE|FINAL|ABSTRACT)\s+)*(METHOD)\s+(?:(?:PRIVATE|PUBLIC|PROTECTED|STATIC|OVERRIDE|FINAL|ABSTRACT)\s+)*(?:\S+\s+)?([\w\-.]+)\s*\(/i;
const blockStart = (line: string) => PROC_START.exec(line) ?? METHOD_START.exec(line);
const BLOCK_END = /^\s*END\s+(PROCEDURE|FUNCTION|METHOD)\b/i;
const CLASS_START = /^\s*CLASS\s+([\w.]+)/i;

/** Strip /* ... *​/ comments (ABL comments nest) and // line comments, keeping line count. */
export function stripComments(src: string): string {
  let out = '';
  let depth = 0;
  for (let i = 0; i < src.length; i++) {
    const two = src.substr(i, 2);
    if (two === '/*') { depth++; i++; out += '  '; continue; }
    if (two === '*/' && depth > 0) { depth--; i++; out += '  '; continue; }
    if (depth > 0) { out += src[i] === '\n' ? '\n' : ' '; continue; }
    if (two === '//') { while (i < src.length && src[i] !== '\n') { out += ' '; i++; } i--; continue; }
    out += src[i];
  }
  return out;
}

const uniq = (a: string[]) => [...new Set(a)];

export function extractRefs(code: string) {
  const clean = stripComments(code);
  const tables = uniq(
    [...clean.matchAll(/\b(?:FOR\s+(?:EACH|FIRST|LAST)|FIND\s+(?:FIRST|LAST|NEXT|PREV)?|CAN-FIND\s*\(\s*(?:FIRST\s+)?|CREATE|DELETE|DISPLAY|UPDATE|BUFFER-COPY\s+\S+\s+TO|DEFINE\s+(?:TEMP-TABLE|BUFFER)\s+\S+\s+FOR)\s+([A-Za-z][\w\-]*(?:\.[A-Za-z][\w\-]*)?)\b/gi)]
      .map((m) => m[1])
      .filter((t) => !/^(each|first|last|next|prev|where|no-lock|exclusive-lock|share-lock)$/i.test(t)),
  );
  const runs = uniq([...clean.matchAll(/\bRUN\s+([\w\-./]+)/gi)].map((m) => m[1].replace(/\.+$/, '')).filter((r) => !/^(value|super)$/i.test(r)));
  const includes = uniq([...clean.matchAll(/\{\s*([\w\-./]+\.i)\b/gi)].map((m) => m[1]));
  return { tables, runs, includes };
}

export function chunkAbl(path: string, source: string): Chunk[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const chunks: Chunk[] = [];
  const mk = (kind: Chunk['kind'], name: string, start: number, end: number) => {
    const text = lines.slice(start, end + 1).join('\n');
    if (!text.trim()) return;
    chunks.push({ id: `${path}#${start + 1}`, path, kind, name, startLine: start + 1, endLine: end + 1, text, ...extractRefs(text) });
  };

  let cursor = 0; // first line not yet assigned to a chunk
  const classMatch = lines.map((l) => CLASS_START.exec(l)).find(Boolean);
  if (classMatch) mk('class', classMatch[1], 0, Math.min(lines.length - 1, 30)); // header summary

  let i = 0;
  const maskedLines = stripComments(source.replace(/\r\n/g, '\n')).split('\n');
  while (i < lines.length) {
    const m = blockStart(maskedLines[i]);
    if (m && !/\bFORWARD\b/i.test(maskedLines[i])) {
      if (i > cursor) pushMain(cursor, i - 1);
      const kind = m[1].toLowerCase() as 'procedure' | 'function' | 'method';
      let j = i;
      while (j < lines.length && !BLOCK_END.test(maskedLines[j])) j++;
      const end = Math.min(j, lines.length - 1);
      mk(kind, m[2], i, end);
      cursor = end + 1;
      i = end + 1;
    } else i++;
  }
  if (cursor < lines.length) pushMain(cursor, lines.length - 1);
  return chunks;

  // Everything outside a named block: definitions, main block. Window it so chunks stay small.
  function pushMain(from: number, to: number) {
    for (let s = from; s <= to; s += MAX_WINDOW) mk('main', '(main block)', s, Math.min(to, s + MAX_WINDOW - 1));
  }
}
