#!/usr/bin/env node
import { resolve } from 'node:path';
import { startServer } from '../src/server.js';
import { createExplainer, indexDirectory, loadProcesses, PACKAGE_DIR } from '../src/index.js';
import { join } from 'node:path';

const [cmd, ...args] = process.argv.slice(2);
const HELP = `explainer <command>
  serve                      start the API, demo host app and /embed.js   (EXPLAINER_PORT, default 8787)
  index <dir> [--clear]      chunk and embed a code base into the vector store
  check [dir]                validate checked-in *.process.json files (use in CI)
  generate "<prompt>" [--process id] [--out file.html]   generate once from the command line
Environment: see README.md`;

if (cmd === 'serve') {
  const s = await startServer();
  const h = s.app;
  // First run: index EXPLAINER_CODE_DIR (or the repo's bundled sample code base) so the demo has something to retrieve.
  const { existsSync } = await import('node:fs');
  const bundled = join(PACKAGE_DIR, 'sample-code'), codeDir = process.env.EXPLAINER_CODE_DIR || (existsSync(bundled) ? bundled : join(PACKAGE_DIR, '../../test/fixtures/bafoz'));
  if (await h.store.count() === 0 && existsSync(codeDir)) { console.log(`Index is empty, indexing ${codeDir} ...`); await indexDirectory(resolve(codeDir), { store: h.store, embedder: h.embedder }); }
  console.log(`Explainer on http://127.0.0.1:${s.port}  (provider: ${h.provider.name}${h.provider.model ? ' ' + h.provider.model : ''}, indexed chunks: ${await h.store.count()}, processes: ${h.catalog.processes.length})`);
  if (h.processErrors.length) console.warn('Process problems:\n' + h.processErrors.join('\n'));
  if (h.provider.name === 'offline') console.log('No ANTHROPIC_API_KEY: running in offline replay mode (checked-in processes only).');
} else if (cmd === 'index') {
  const dir = args.find((a) => !a.startsWith('--'));
  if (!dir) { console.error('Usage: explainer index <dir> [--clear]'); process.exit(2); }
  const { store, embedder } = await createExplainer();
  if (args.includes('--clear')) await store.clear();
  const n = await indexDirectory(resolve(dir), { store, embedder, onProgress: (d, t) => process.stdout.write(`\rindexed ${d}/${t}`) });
  console.log(`\nDone: ${n} chunks from ${resolve(dir)} using ${embedder.name}.`);
} else if (cmd === 'check') {
  const { processes, errors } = loadProcesses(args[0] ? resolve(args[0]) : join(PACKAGE_DIR, 'processes'));
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log(`OK: ${processes.length} process definition(s) valid.`);
} else if (cmd === 'generate') {
  const prompt = args.find((a) => !a.startsWith('--'));
  const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const { explainer } = await createExplainer();
  const out = await explainer.explain({ prompt, processId: opt('--process') }, (e) => e.type === 'stage' && console.error('·', e.message));
  const { writeFileSync } = await import('node:fs');
  const f = opt('--out') || 'explainer.html'; writeFileSync(f, out.html); console.log(`Wrote ${f} (${out.spec.steps.length} steps, ${out.meta.provider}).`);
} else { console.log(HELP); process.exit(cmd ? 2 : 0); }
