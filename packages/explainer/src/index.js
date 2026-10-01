import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Explainer } from './generate.js';
import { ProcessCatalog, loadProcesses } from './processes.js';
import { embedderFromEnv } from './vector/embed.js';
import { storeFromEnv } from './vector/stores.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { OfflineProvider } from './providers/offline.js';

export { normalizeSpec } from './spec.js';
export { renderHtml } from './render.js';
export { Explainer, ExplainerError } from './generate.js';
export * from './vector/embed.js';
export * from './vector/stores.js';
export { indexDirectory, collectChunks } from './vector/chunk.js';
export { loadProcesses, validateProcess, ProcessCatalog } from './processes.js';

export const PACKAGE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

export function providerFromEnv(env = process.env) {
  if (env.ANTHROPIC_API_KEY && env.EXPLAINER_PROVIDER !== 'offline')
    return new AnthropicProvider({ apiKey: env.ANTHROPIC_API_KEY, model: env.EXPLAINER_MODEL || 'claude-opus-5-5', effort: env.EXPLAINER_EFFORT || 'medium',
      baseURL: env.ANTHROPIC_BASE_URL, fallbacks: env.EXPLAINER_FALLBACKS !== 'off' });
  return new OfflineProvider();
}

/** Wire everything from environment variables. Pass overrides for tests or for embedding in another Node app. */
export async function createExplainer({ env = process.env, store, embedder, provider, processesDir, dataDir } = {}) {
  embedder ||= embedderFromEnv(env);
  store ||= storeFromEnv(env, dataDir || join(PACKAGE_DIR, '.data'));
  provider ||= providerFromEnv(env);
  const { processes, errors } = loadProcesses(processesDir || env.EXPLAINER_PROCESSES || join(PACKAGE_DIR, 'processes'));
  const catalog = await new ProcessCatalog(processes, embedder).init();
  return { explainer: new Explainer({ store, embedder, catalog, provider }), store, embedder, catalog, provider, processErrors: errors };
}
