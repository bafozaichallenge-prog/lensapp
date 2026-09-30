import { defineConfig } from 'vitest/config';
import path from 'node:path';

const alias: Record<string, string> = {};
for (const p of ['core', 'gitlab', 'ingest', 'graph', 'impact', 'pack', 'ai', 'storage']) {
  alias[`@lens/${p}`] = path.resolve(__dirname, `packages/${p}/src/index.ts`);
}

export default defineConfig({
  resolve: { alias },
  test: { include: ['packages/*/test/**/*.test.ts', 'test/**/*.test.ts'] },
});
