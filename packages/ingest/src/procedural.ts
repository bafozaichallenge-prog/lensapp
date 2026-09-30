import { stripAbl } from './text';

export interface ProceduralRefs { runs: string[]; includes: string[] }

/** RUN x.p and {x.i} includes. Argument/preprocessor includes like {&VAR} and {1} are ignored. */
export function parseProcedural(raw: string): ProceduralRefs {
  const blanked = stripAbl(raw);                       // comments and string contents removed
  const withStrings = stripAbl(raw, { keepStrings: true }); // same offsets, string contents kept (RUN "x.p", {inc/x.i})
  const runs: string[] = [];
  // RUN keyword must sit in code; its target may be a quoted literal, which we read from the string-preserving copy.
  for (const m of blanked.matchAll(/\bRUN\s+/gi)) {
    const at = m.index! + m[0].length;
    const t = withStrings.slice(at, at + 200).match(/^["']?([A-Za-z0-9_\-./\\]+\.(?:p|w|r))\b/i);
    if (t) runs.push(t[1]!.replace(/\\/g, '/'));
  }
  const includes = [...withStrings.matchAll(/\{\s*([A-Za-z0-9_\-./\\]+\.i)\b[^}]*\}/gi)].map((m) => m[1]!.replace(/\\/g, '/'));
  return { runs: [...new Set(runs)], includes: [...new Set(includes)] };
}

export interface TableAccess { read: string[]; write: string[] }

/** Table access: FOR EACH/FIND => read; CREATE/DELETE => write (plan §10.1). Only names in `knownTables` count. */
export function parseTableAccess(raw: string, knownTables: Set<string>): TableAccess {
  const code = stripAbl(raw);
  const read = new Set<string>(), write = new Set<string>();
  const known = (t: string) => knownTables.has(t.toLowerCase());
  for (const m of code.matchAll(/\bFOR\s+(?:EACH|FIRST|LAST)\s+([A-Za-z_][\w\-]*)/gi)) if (known(m[1]!)) read.add(m[1]!.toLowerCase());
  for (const m of code.matchAll(/\bFIND\s+(?:FIRST\s+|LAST\s+|NEXT\s+|PREV\s+)?([A-Za-z_][\w\-]*)/gi)) if (known(m[1]!)) read.add(m[1]!.toLowerCase());
  for (const m of code.matchAll(/\bCREATE\s+([A-Za-z_][\w\-]*)/gi)) if (known(m[1]!)) write.add(m[1]!.toLowerCase());
  for (const m of code.matchAll(/\bDELETE\s+([A-Za-z_][\w\-]*)/gi)) if (known(m[1]!)) write.add(m[1]!.toLowerCase());
  return { read: [...read].sort(), write: [...write].sort() };
}
