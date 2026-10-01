// Builds exports/process-explainer-demo.html: one file, no server, no API key.
// It bakes in explainers generated (offline replay) for the demo requirements, so the page shows the real output format.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExplainer, indexDirectory, MemoryVectorStore, HashEmbedder } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const code = [join(here, '../sample-code'), join(here, '../../../test/fixtures/bafoz')].find(existsSync);
const reqs = JSON.parse(readFileSync(join(here, '../demo/requirements.json'), 'utf8'));
const embedder = new HashEmbedder(), store = new MemoryVectorStore();
await indexDirectory(code, { store, embedder });
const { explainer } = await createExplainer({ env: { EXPLAINER_PROVIDER: 'offline' }, store, embedder });

const baked = {};
for (const r of reqs) {
  const out = await explainer.explain({ prompt: `Explain the business process that requirement ${r.id} changes: ${r.text}`, processId: r.processId,
    context: { requirement: { id: r.id, title: r.title, text: r.text, score: r.score, dimensions: r.dimensions, findings: r.findings } }, header: false, noCache: true });
  baked[r.id] = { html: out.html, steps: out.spec.steps.length, questions: out.spec.steps.flatMap((s) => s.rules).filter((x) => x.kind === 'question').length, spec: out.spec };
}
const safe = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, '');
const page = readFileSync(join(here, '../demo/host-app.html'), 'utf8');

// Reuse the host-app page, swapping the live API call for the baked results.
let html = page
  .replace('<title>Requirement Scorer (host app demo)</title>', '<title>Process explainer: static demo</title>')
  .replace('<script type="module" src="/embed.js"></script>\n', '')
  .replace(/<process-explainer[^>]*><\/process-explainer>/, `<div id="pe-wrap"><div id="pe-status" class="meta" role="status"></div><iframe id="pe" title="Process explainer" sandbox="allow-scripts" style="display:none;width:100%;border:1px solid var(--line);border-radius:8px;min-height:640px"></iframe></div>
      <details style="margin-top:12px"><summary class="meta" style="cursor:pointer">Show the generated spec (JSON). This is all the AI produces; the page above is rendered from it.</summary><pre id="spec" style="max-height:320px;overflow:auto;font-size:12px;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:12px"></pre></details>`)
  .replace(/<script type="module">[\s\S]*<\/script>\s*<\/body>/, `<script type="application/json" id="baked">${safe(baked)}</script>
<script type="module">
const reqs = ${safe(reqs)};
const baked = JSON.parse(document.getElementById('baked').textContent);
${page.match(/const \$ = [\s\S]*?pick\(0\);/)[0]}
const frame = $('#pe'), status = $('#pe-status');
$('#go').onclick = async () => {
  const b = baked[cur.id]; $('#go').disabled = true;
  for (const m of ['Reading the indexed code and processes…', 'Matching process “new-business”…', 'Checking the structure…']) { $('#meta').textContent = m; await new Promise((r) => setTimeout(r, 450)); }
  frame.srcdoc = b.html; frame.style.display = 'block'; $('#spec').textContent = JSON.stringify(b.spec, null, 2);
  $('#meta').textContent = b.steps + ' steps · ' + b.questions + ' of the ' + cur.findings.length + ' assessment findings placed as open questions · baked sample, no AI call';
  $('#go').disabled = false; frame.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};
addEventListener('message', (e) => { if (e.source === frame.contentWindow && e.data?.source === 'process-explainer' && e.data.type === 'height') frame.style.height = Math.min(4000, Math.max(300, e.data.height)) + 'px'; });
let dark = matchMedia('(prefers-color-scheme: dark)').matches;
$('#theme').onclick = () => { dark = !dark; document.documentElement.style.colorScheme = dark ? 'dark' : 'light'; frame.contentWindow?.postMessage({ source: 'process-explainer-host', type: 'theme', theme: dark ? 'dark' : 'light' }, '*'); };
document.querySelectorAll('#list button').forEach((b) => b.addEventListener('click', () => { frame.style.display = 'none'; $('#meta').textContent = 'Press the button to generate.'; }));
</script>
</body>`);
html = html.replace('<span>Host app demo: assesses business requirements, then explains the process each one touches</span>', '<span>Static demo: pre-generated explainers, no server. In production the button calls the generator.</span>');
mkdirSync(join(here, '../../../exports'), { recursive: true });
const out = join(here, '../../../exports/process-explainer-demo.html');
writeFileSync(out, html);
console.log(`Wrote ${out} (${(html.length / 1024).toFixed(0)} KB, ${Object.keys(baked).length} requirements)`);
