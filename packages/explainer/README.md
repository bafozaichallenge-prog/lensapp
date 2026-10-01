# Process explainer generator

Prompt in, one consistent interactive explainer out (phone-screen walkthrough + narration + rules + data carried forward + progress track, like the LEZA sales journey explainer). Embeddable in another web app as `<process-explainer>`.

```
 user prompt ─┐
 host context ─┼─►  retrieve ──► prompt ──► Claude ──► JSON spec ──► validate/repair ──► ground sources ──► renderer ──► HTML
 code index  ──┤   (vector DB)               (structured output)     (spec.js)           (drop invented refs)  (fixed template)
 processes/  ──┘   (checked-in JSON)
```

**Why the output is always consistent:** the model never writes HTML or animation timing. It fills a fixed JSON spec (`src/spec.js`, `src/json-schema.js`); `normalizeSpec()` repairs or rejects it; `renderHtml()` is the only thing that produces markup, and every string is escaped. Timing of the phone animation is derived from the components.

## Run the demo (no API key needed)

```bash
npm install                                  # at the repo root (the AI SDK is an optional dependency)
npm -w @lens/explainer start                 # http://127.0.0.1:8787
```
- `/` host-app demo: a requirement scorer that embeds the generator and passes score + findings as context
- `/tool` the generator on its own (prompt box)
- First start indexes the repo's sample OpenEdge code base (`test/fixtures/bafoz`) into the local vector store.
- Without `ANTHROPIC_API_KEY` it runs in **offline replay**: it replays a checked-in process (no AI) and places the host's findings as open questions. Free-form prompts need the key.

With AI: `ANTHROPIC_API_KEY=… npm -w @lens/explainer start`.

Standalone (from the zip): `npm install && npm start`. Rebuild the zip with `npm -w @lens/explainer run pack` (writes `exports/`).

## Inputs

| Input | How it gets in | Notes |
|---|---|---|
| Code base | `explainer index <dir>` chunks at ABL method/procedure boundaries (or headings in docs), embeds, upserts to the vector store | Memory store (JSON file) by default; Qdrant via `EXPLAINER_QDRANT_URL`. Plug any store by implementing `upsert/query/clear/count` (`src/vector/stores.js`) |
| Predefined processes | `processes/*.process.json`, validated by `explainer check` (CI) | JSON, not HTML: reviewable diffs, validated, holds facts (steps, rule codes, refs) not layout. The HTML is output only. See `processes/README.md` |
| User prompt + host context | `POST /api/explain {prompt, processId?, context?}` | `context` is any JSON the host wants considered (for example the requirement and its assessment findings) |

Embeddings: offline `HashEmbedder` (lexical, identifier-aware) by default. For production quality set `EXPLAINER_EMBED_URL/KEY/MODEL` (any OpenAI-compatible `/embeddings` endpoint) and re-index. Changing embedder means re-indexing.

## API

| Route | |
|---|---|
| `POST /api/explain` | body `{prompt, processId?, context?, theme?, header?, noCache?}`. With `Accept: text/event-stream` streams `stage`, `retrieval`, `progress`, then `result` (or `error`). Otherwise JSON. Result: `{spec, html, meta}` |
| `POST /api/render` | `{spec}` → `{spec, html, warnings}`. Render a stored/edited spec with no AI |
| `GET /api/processes`, `/api/search?q=`, `/api/health` | catalogue, retrieval debugging, status |
| `GET /embed.js` | the web component |

`meta`: provider, model, ai, usage, repaired, warnings, `groundingRemoved`, retrieval (processes, chunk count), cached.

## Embedding

```html
<script type="module" src="https://EXPLAINER_HOST/embed.js"></script>
<process-explainer endpoint="https://EXPLAINER_HOST" process-id="new-business" hide-header></process-explainer>
<script>
  const pe = document.querySelector('process-explainer');
  pe.context = { requirement: { id: 'REQ-101', score: 62, findings: ['…'] } };
  pe.generate({ prompt: 'Explain the process REQ-101 changes' });
  pe.addEventListener('explainer-ready', (e) => console.log(e.detail.spec, e.detail.meta));
</script>
```
Attributes `endpoint prompt process-id theme(auto|light|dark) show-prompt hide-header autogenerate token`; properties `context headers fetch`; methods `generate load abort`; events `explainer-stage/progress/ready/error`. The explainer renders in a **sandboxed iframe** (`sandbox="allow-scripts"`, no same-origin) and auto-sizes via `postMessage`. Style with `--pe-accent --pe-border --pe-radius --pe-font`.

## Configuration (environment)

`ANTHROPIC_API_KEY`, `EXPLAINER_MODEL` (default `claude-opus-5-5`), `EXPLAINER_EFFORT` (`medium`), `EXPLAINER_FALLBACKS=off`, `EXPLAINER_PROVIDER=offline`, `EXPLAINER_PORT/HOST`, `EXPLAINER_API_KEY` (bearer auth on `/api`), `EXPLAINER_ALLOWED_ORIGINS` (comma list for CORS), `EXPLAINER_RATE_PER_MIN` (12), `EXPLAINER_MAX_CONCURRENT` (3), `EXPLAINER_INDEX_FILE`, `EXPLAINER_QDRANT_URL/COLLECTION/KEY`, `EXPLAINER_EMBED_URL/KEY/MODEL`, `EXPLAINER_PROCESSES`, `EXPLAINER_CODE_DIR`.

## Safety

Secrets, e-mail, SA ID numbers and phone numbers are redacted from everything sent to the model. Retrieved text is fenced as data and cannot close its fence. Source citations the model was not given are removed (`meta.groundingRemoved`). Output is escaped, rendered from a fixed template, and shown in a sandboxed iframe. The API has bearer auth, an origin allow-list, a body limit, a per-IP rate limit and a concurrency cap.

## Tests

`npm -w @lens/explainer test` (Node's test runner, no extra deps). Covers spec repair, escaping, identical shell for different content, retrieval, offline replay, the AI path with a fake client (schema request, repair loop, grounding, fence), the HTTP server, and the Qdrant REST contract.

## Known limits

- **Not run against the live Anthropic API** (no key in the authoring environment). The provider was verified against the real SDK talking to a local fake streaming server, including the fallback degradation. The structured-output schema (`src/json-schema.js`) has not been accepted by the live API yet; if it is rejected the provider retries with the schema in the prompt instead.
- The Qdrant adapter is tested against a mock REST server, not a real Qdrant.
- Offline embeddings are lexical; expect weaker retrieval than a real embedding model.
- Offline replay uses only `capture`, `rules`, `validation`, `result` from a process definition; screens are plainer than AI-designed ones.
- The animation engine supports the 18 component types in `src/spec.js`; a new kind of screen means adding a component.
