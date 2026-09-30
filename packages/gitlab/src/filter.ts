export const INGEST_EXT = new Set(['.cls', '.p', '.w', '.i', '.t', '.df', '.md', '.txt', '.json', '.xml', '.yml']);
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
const SKIP_DIR = /(^|\/)(\.git|node_modules|build|dist|out|bin|obj)\//;

const extOf = (p: string) => { const b = p.slice(p.lastIndexOf('/') + 1); const i = b.lastIndexOf('.'); return i < 0 ? '' : b.slice(i).toLowerCase(); };

/** Plan §8.3: ingest ABL/doc/config types; skip .git, node_modules, build output and files over 2 MB. Optional path filters. */
export function shouldIngest(path: string, size: number, pathFilters: string[] = []): boolean {
  if (SKIP_DIR.test(path)) return false;
  if (!INGEST_EXT.has(extOf(path))) return false;
  if (size > MAX_FILE_BYTES) return false;
  if (pathFilters.length && !pathFilters.some((f) => path.startsWith(f.replace(/^\//, '')))) return false;
  return true;
}
