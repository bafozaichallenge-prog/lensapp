// Bundles the worker (and its workspace packages) into one ES module so the runtime image needs no TypeScript tooling.
import { build } from 'esbuild';

await build({
  entryPoints: ['apps/worker/src/main.ts'],
  outfile: 'dist/worker.mjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  // packages with native code or dynamic requires stay as runtime dependencies
  external: ['@prisma/client', '.prisma/client', 'pg-boss', 'pg', 'pg-native', 'adm-zip', 'mammoth'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
});
