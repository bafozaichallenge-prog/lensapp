import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { chunkAbl, type Chunk } from './abl.js';

const ABL_EXT = /\.(p|w|i|cls|t)$/i;
const SKIP_DIR = new Set(['.git', 'node_modules', '.rag']);
const MAX_BYTES = 1_000_000;

async function* walk(dir: string): AsyncGenerator<string> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIR.has(e.name)) yield* walk(join(dir, e.name)); }
    else if (ABL_EXT.test(e.name)) yield join(dir, e.name);
  }
}

export async function collectChunks(root: string): Promise<{ chunks: Chunk[]; files: number }> {
  const chunks: Chunk[] = [];
  let files = 0;
  for await (const f of walk(root)) {
    const buf = await readFile(f);
    if (buf.length > MAX_BYTES) continue;
    files++;
    chunks.push(...chunkAbl(relative(root, f).split('\\').join('/'), buf.toString('utf8')));
  }
  return { chunks, files };
}
