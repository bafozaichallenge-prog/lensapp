import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import type { Chunk } from './abl.js';
import type { Embedder } from './embed.js';
import type { Index } from './store.js';

const fmt = (c: Chunk) =>
  `${c.path}:${c.startLine}-${c.endLine}  [${c.kind} ${c.name}]` +
  (c.tables.length ? `  tables: ${c.tables.join(', ')}` : '') +
  (c.runs.length ? `  runs: ${c.runs.join(', ')}` : '');

export async function searchCode(ix: Index, e: Embedder, query: string, limit = 8) {
  const hits = await ix.search(query, e, limit);
  if (!hits.length) return 'No matches.';
  return hits.map((h, n) => `#${n + 1} ${fmt(h.chunk)}\n${h.chunk.text.split('\n').slice(0, 40).join('\n')}`).join('\n\n---\n\n');
}

export function findReferences(ix: Index, kind: 'table' | 'run' | 'include', name: string) {
  const n = name.toLowerCase();
  const key = kind === 'table' ? 'tables' : kind === 'run' ? 'runs' : 'includes';
  const rows = ix.rows.filter((r) => r[key].some((x) => x.toLowerCase() === n || x.toLowerCase().endsWith('.' + n)));
  return rows.length ? rows.map(fmt).join('\n') : `No ${kind} references to "${name}".`;
}

export function listSymbols(ix: Index, path?: string) {
  const rows = ix.rows.filter((r) => r.kind !== 'main' && (!path || r.path === path));
  return rows.length ? rows.map(fmt).join('\n') : 'No procedures, functions or methods found.';
}

/** Read lines from a file under `root`; refuses paths that escape it. */
export async function readSource(root: string, path: string, from = 1, to = from + 199) {
  const base = resolve(root);
  const full = resolve(base, path);
  if (full !== base && !full.startsWith(base + sep)) throw new Error('Path is outside the source root.');
  const lines = (await readFile(full, 'utf8')).split(/\r?\n/);
  const end = Math.min(to, from + 399, lines.length);
  return lines.slice(from - 1, end).map((l, i) => `${from + i}: ${l}`).join('\n');
}
