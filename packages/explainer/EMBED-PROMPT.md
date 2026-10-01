# Prompt: embed the Process Explainer into our requirements-scoring app

> Paste this whole file into the Claude session that is building the host app, and attach `process-explainer-embed.zip`.

## Your task
Add an **"Explain process"** feature to our web app, which assesses and scores business requirements. It uses the attached **Process Explainer** package: given a prompt, a checked-in process and our code base (indexed in a vector DB), an AI writes an interactive walkthrough of the business process (phone screens that animate, narration, rules, data carried forward, progress track). The output format is fixed by the package, so every explainer looks the same. **Do not generate explainer HTML yourself and do not change the package's look.** Integrate it.

## What is in the zip
```
package.json            zero-build ESM package (Node 20+). Optional dep: @anthropic-ai/sdk
README.md               full docs (API, env, safety, known limits). Read it first.
bin/explainer.js        CLI: serve | index <dir> | check | generate
src/                    spec validator, renderer, generator, vector stores, providers, HTTP server
public/embed.js         the <process-explainer> web component (served at /embed.js)
processes/              predefined processes as *.process.json (+ README with the format)
demo/host-app.html      a working example of exactly this integration. Copy its pattern.
examples/               a reference spec using every screen component
test/                   node --test suite
sample-code/            small OpenEdge ABL code base used by the demo and tests (replace with ours)
```

## Architecture (decide where each piece runs)
1. **Explainer service** = `node bin/explainer.js serve` (or `startServer()` / `createExplainer()` imported into our Node backend). It holds the API key and the vector store. Run it as a separate service or mount it in our backend. The browser never sees the Anthropic key.
2. **Host app front end** loads `<script type="module" src="{EXPLAINER_URL}/embed.js">` and uses `<process-explainer>`.
3. **Vector DB**: our code base is indexed with `node bin/explainer.js index <path-to-our-repo>`. Default store is a JSON file; for production set `EXPLAINER_QDRANT_URL` (or implement the 4-method `VectorStore` interface in `src/vector/stores.js` for our DB, e.g. pgvector). Use a real embedding model in production: `EXPLAINER_EMBED_URL/KEY/MODEL` (OpenAI-compatible `/embeddings`), then re-index. Re-index on every merge to the main branch.
4. **Predefined processes** live in our repo as `processes/<id>.process.json`, validated in CI with `node bin/explainer.js check`. Format is in `processes/README.md`. JSON was chosen over HTML on purpose: HTML is output, JSON holds the facts (steps, rule codes, refs). Create one per business process our requirements touch.

## Integration contract
```html
<script type="module" src="{EXPLAINER_URL}/embed.js"></script>
<process-explainer id="pe" endpoint="{EXPLAINER_URL}" hide-header></process-explainer>
<script>
  const pe = document.getElementById('pe');
  pe.context = { requirement: { id, title, text, score, dimensions, findings: [/* strings: assessment gaps */] } };
  pe.generate({ prompt: `Explain the process requirement ${id} changes: ${text}`, processId /* optional */ });
  pe.addEventListener('explainer-ready', e => { /* e.detail.spec, e.detail.meta */ });
  pe.addEventListener('explainer-error', e => { /* e.detail.code, e.detail.message */ });
</script>
```
- **Context is the point of the integration.** Pass each requirement's score, dimension scores and assessment findings. The generator turns every finding into an *open question* on the step it affects, so reviewers see where a weak requirement bites in the process.
- Other attributes: `theme="light|dark"` (mirror our theme toggle), `show-prompt` (free-text prompt box), `autogenerate`, `token`. Properties: `headers`, `fetch` (set a custom `fetch` to add our auth). Events: `explainer-stage`, `explainer-progress`, `explainer-ready`, `explainer-error`. Style with CSS variables `--pe-accent --pe-border --pe-radius --pe-font`.
- Server-side or API use: `POST {EXPLAINER_URL}/api/explain` with `{prompt, processId?, context?}` returns `{spec, html, meta}`; with `Accept: text/event-stream` it streams progress. `POST /api/render {spec}` renders a stored spec with no AI call.
- **Persist the `spec`** (JSON, small) with the requirement assessment if we want history; re-render it later through `/api/render` (or `pe.load(spec)`). Do not persist the HTML.
- A generation takes tens of seconds with AI. Keep the explainer behind an explicit button, show the built-in progress, and rely on the 10-minute server cache for repeats.

## Configuration for our deployment
Set on the explainer service: `ANTHROPIC_API_KEY`, `EXPLAINER_API_KEY` (our backend sends it as `Authorization: Bearer`; if the browser calls the service directly, proxy through our backend instead and set `pe.fetch`), `EXPLAINER_ALLOWED_ORIGINS=https://our-app.example`, optionally `EXPLAINER_MODEL`, `EXPLAINER_QDRANT_URL`, `EXPLAINER_EMBED_*`. Without `ANTHROPIC_API_KEY` it runs in offline replay (checked-in processes only), which is fine for local development.

## Do these steps
1. Unzip into `packages/process-explainer` (or a sibling service). `npm install` (inside the package, or `npm install @anthropic-ai/sdk` in our backend). Run `npm test` and `node bin/explainer.js check`.
2. Run the demo: `node bin/explainer.js serve`, open `/`, and confirm the explainer renders for the sample requirements.
3. Index our code base; add `processes/*.process.json` for our real processes (start from `processes/new-business.process.json`).
4. Add the button + `<process-explainer>` to our requirement detail view, passing score and findings as context. Mirror our light/dark theme with the `theme` attribute.
5. Wire auth/CORS as above. Add the explainer service to our deployment and CI (`check` and `test`).
6. Handle errors in the UI: show `e.detail.message`; codes: `bad_prompt`, `unknown_process`, `no_process` (offline mode needs a process), `rate_limited`, `busy`, `invalid_output`, `refusal`, `too_long`, `unauthorized`.

## Rules for you
- Do not edit `src/spec.js`, `src/render.js` or `src/assets/*` to restyle output. If a screen needs something new, add a component type there and in `src/json-schema.js`, with a test.
- Never send the Anthropic key, or raw requirement text containing personal data, to the browser or logs. The package redacts secrets and common personal data before the model call, but do not rely on it for anything beyond that.
- Be honest in our UI that the walkthrough is AI-generated from our code and processes, and show `meta.groundingRemoved` / the "Based on" sources if reviewers want to audit it.

## Known limits (tell us if they bite)
Not yet run against the live Anthropic API or a real Qdrant; offline embeddings are lexical; offline replay screens are plainer than AI-designed ones. If the live API rejects the structured-output schema the provider falls back to schema-in-prompt automatically. Report anything else you find.

## Done when
Selecting a requirement and pressing the button shows an explainer for the right process, each assessment finding appears as an open question on a relevant step, theme matches the host app, errors are readable, tests and `check` pass in CI.
