# Process definitions

One `*.process.json` per process. These are the authoritative facts the generator may not invent: steps, rule codes,
what each step captures, and which source files implement it. Layout is not stored here; the explainer is generated.

Validate in CI: `npm -w @lens/explainer run check`.

| Field | Meaning |
|---|---|
| `id`, `name`, `summary`, `keywords` | Identity and retrieval hints (`id` is kebab-case) |
| `brand` | Optional `{base, accent, accentColor}` display names and accent colour |
| `phases` | Names for the progress track |
| `steps[].id/name/description/requirement` | Required: `id`, `name`, `description` |
| `steps[].phase` | Index into `phases` |
| `steps[].capture[]` | `{label, example, mode}` fields shown on the screen. `mode`: `type` (default), `fill`, `static`, `locked` |
| `steps[].rules[]` | `{code?, kind: gate\|rule\|data\|question, text}` |
| `steps[].refs[]` | Repo paths. The generator may cite only these or retrieved code paths |
| `steps[].validation` / `result` | Optional hints for a validation step or a result table |
| `openQuestions[]` | Things the process owners already know are unresolved |
