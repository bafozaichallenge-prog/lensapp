import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname, sep } from 'node:path';

const SKIP_DIR = new Set(['.git', 'node_modules', '.next', 'dist', 'build', '.data', 'coverage']);
const CODE = new Set(['.cls', '.p', '.i', '.w', '.df', '.ts', '.tsx', '.js', '.mjs', '.cs', '.java', '.py', '.sql', '.go']);
const DOC = new Set(['.md', '.txt']);
const BOUNDARY = /^\s*(METHOD|CONSTRUCTOR|DESTRUCTOR|PROCEDURE|FUNCTION|CLASS|ADD TABLE|function|export|class|def)\b/i;
const MAX_BYTES = 200_000;

export function* walk(root) {
  for (const name of readdirSync(root)) {
    if (SKIP_DIR.has(name)) continue;
    const p = join(root, name), st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (st.size <= MAX_BYTES && (CODE.has(extname(name).toLowerCase()) || DOC.has(extname(name).toLowerCase()))) yield p;
  }
}

/** Split a file at declaration boundaries (ABL methods/procedures, functions) or headings, capped at maxLines. */
export function chunkFile(path, text, { minLines = 12, maxLines = 60 } = {}) {
  const ext = extname(path).toLowerCase(), isDoc = DOC.has(ext), lines = text.split(/\r?\n/), out = [];
  let start = 0;
  const flush = (end) => {
    const body = lines.slice(start, end).join('\n').trim();
    if (body.length > 20) out.push({ startLine: start + 1, endLine: end, text: body });
    start = end;
  };
  for (let i = 1; i < lines.length; i++) {
    const len = i - start, hit = isDoc ? /^#{1,3}\s/.test(lines[i]) : BOUNDARY.test(lines[i]);
    if ((hit && len >= minLines) || len >= maxLines) flush(i);
  }
  flush(lines.length);
  return out.map((c) => ({ ...c, kind: isDoc ? 'doc' : 'code', path }));
}

export function collectChunks(root) {
  const chunks = [];
  for (const f of walk(root)) {
    const rel = relative(root, f).split(sep).join('/');
    for (const c of chunkFile(rel, readFileSync(f, 'utf8'))) chunks.push(c);
  }
  return chunks;
}

export async function indexDirectory(root, { store, embedder, onProgress }) {
  const chunks = collectChunks(root);
  const batch = 64;
  for (let i = 0; i < chunks.length; i += batch) {
    const part = chunks.slice(i, i + batch);
    const vecs = await embedder.embed(part.map((c) => `${c.path}\n${c.text}`));
    await store.upsert(part.map((c, j) => ({ id: `${c.path}:${c.startLine}`, vector: vecs[j], meta: c })), embedder.name);
    onProgress?.(Math.min(chunks.length, i + batch), chunks.length);
  }
  return chunks.length;
}
