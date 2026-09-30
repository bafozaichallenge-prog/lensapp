import type { SymbolNode } from '@lens/core';
import { stripAbl } from './text';

export interface ParsedClass {
  symbol: SymbolNode;
  uses: string[];        // USING x.y.Type
  typeRefs: string[];    // AS Type, CAST(.., Type), NEW Type(
  creates: string[];     // NEW Type(
}

/** Header comment in the house style `/*---- ... ----*​/`, trimmed to 900 chars (prototype); falls back to any leading block comment. */
export function extractHeader(raw: string): string | undefined {
  const dash = raw.match(/^\s*\/\*-+\s*([\s\S]*?)-+\*\//);
  if (dash) return dash[1]!.replace(/\n\s+/g, '\n').trim().slice(0, 900) || undefined;
  const any = raw.match(/^\s*\/\*([\s\S]*?)\*\//);
  if (!any) return undefined;
  return any[1]!.split('\n').map((l) => l.replace(/^\s*\*?\s?/, '').trimEnd()).join('\n').trim().slice(0, 900) || undefined;
}

const KEYWORD_TYPES = new Set([
  'CHARACTER', 'CHAR', 'INTEGER', 'INT', 'INT64', 'DECIMAL', 'DEC', 'LOGICAL', 'DATE', 'DATETIME',
  'DATETIME-TZ', 'HANDLE', 'LONGCHAR', 'MEMPTR', 'RAW', 'ROWID', 'RECID', 'COM-HANDLE', 'BLOB', 'CLOB',
  'WIDGET-HANDLE', 'OBJECT', 'CLASS', 'EXTENT', 'TABLE', 'BUFFER', 'TEMP-TABLE', 'DATASET', 'PROGRESS',
]);
const MODS = '(?:PUBLIC|PRIVATE|PROTECTED|STATIC|OVERRIDE|ABSTRACT|FINAL)';

/** USING / AS / CAST / NEW type references; valid in classes and procedures alike. */
export function extractTypeRefs(raw: string): { uses: string[]; creates: string[]; typeRefs: string[] } {
  const code = stripAbl(raw);
  const uses = [...code.matchAll(/^\s*USING\s+([\w.*\-]+)/gim)].map((m) => m[1]!.replace(/\.$/, ''));
  const creates = [...code.matchAll(/\bNEW\s+([A-Za-z_][\w.\-]*)\s*\(/gi)].map((m) => m[1]!);
  const asTypes = [...code.matchAll(/\bAS\s+([A-Za-z_][\w.\-]*)/gi)].map((m) => m[1]!);
  const casts = [...code.matchAll(/\bCAST\s*\([^,]+,\s*([A-Za-z_][\w.\-]*)/gi)].map((m) => m[1]!);
  const typeRefs = [...new Set([...asTypes, ...casts, ...creates])].filter((t) => !KEYWORD_TYPES.has(t.toUpperCase()));
  return { uses: [...new Set(uses)], creates: [...new Set(creates)], typeRefs };
}

export function parseClass(path: string, raw: string): ParsedClass | null {
  const code = stripAbl(raw);
  const decl = code.match(/^\s*(?:(ABSTRACT|FINAL)\s+)?(CLASS|INTERFACE)\s+([A-Za-z_][\w.\-]*)([^:]*?):\s*$/im);
  if (!decl) return null;
  const name = decl[3]!;
  const tail = decl[4] ?? '';
  const isInterface = /^interface$/i.test(decl[2]!);
  // ABL places ABSTRACT after the name (CLASS X INHERITS Y ABSTRACT:); tolerate a prefix too.
  const abstract = /^abstract$/i.test(decl[1] ?? '') || /\bABSTRACT\b/i.test(tail);
  const inh = tail.match(/\bINHERITS\s+([A-Za-z_][\w.\-]*)/i)?.[1];
  const impl = tail.match(/\bIMPLEMENTS\s+([\w.,\s\-]+?)(?:\s+(?:ABSTRACT|FINAL|USE-WIDGET-POOL)\b|$)/i)?.[1];
  const implementsList = impl ? impl.split(',').map((s) => s.trim()).filter(Boolean) : [];

  const methods = new Set<string>();
  const tests: string[] = [];
  const rawLines = raw.split('\n');
  // Whole-text scan: the opening parenthesis may sit on the next line (METHOD PUBLIC VOID Create⏎ (...)).
  const methodRe = new RegExp(`\\bMETHOD\\s+(?:${MODS}\\s+)*(?:VOID|[A-Za-z_][\\w.\\-]*(?:\\s+EXTENT(?:\\s+\\d+)?)?)\\s+([A-Za-z_][\\w\\-]*)\\s*\\(`, 'gi');
  for (const m of code.matchAll(methodRe)) {
    methods.add(m[1]!);
    const line = code.slice(0, m.index).split('\n').length - 1;
    let j = line - 1;
    while (j >= 0 && rawLines[j]!.trim() === '') j--;
    if (j >= 0 && /^\s*@Test\b/i.test(rawLines[j]!)) tests.push(m[1]!);
  }

  const { uses, creates, typeRefs } = extractTypeRefs(raw);

  const symbol: SymbolNode = {
    fqn: name,
    name: name.slice(name.lastIndexOf('.') + 1),
    file: path,
    classKind: isInterface ? 'interface' : abstract ? 'abstract' : tests.length ? 'test' : 'class',
    inherits: inh,
    implements: implementsList,
    methods: [...methods].sort(),
    tests,
  };
  return { symbol, uses, typeRefs, creates };
}
