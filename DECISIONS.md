# Decisions

Non-trivial choices, deviations from the plan or the prototype, and known gaps. Format: what was decided, why, and what it costs. IDs are stable; reference them from code comments and reviews.

## Architecture and data model

**D-1 Two layers: immutable snapshot rows and durable overlays.** Plan §13 put `snapshot_id` on tickets, incidents, process steps and pack overrides, and §10.5/§19.1 required custom processes, manual mappings and pack wording to survive re-syncs. Those two requirements conflict. Decision: rows *derived from a sync* are scoped to a snapshot and immutable once it is active (database triggers block updates to `files`/`edges`; finished analyses are also immutable). Rows *made by people or imported* (custom processes, manual edges, tickets, incidents, incident files, import mappings, pack overrides) are scoped to the **source** and keyed by stable refs; they are re-projected onto every new snapshot. Cost: overlay rows always describe "now", so a historical analysis re-opened later shows current incident/ticket text with paths resolved against *its own* snapshot. The deterministic findings and the AI result stored on the analysis are unaffected.

**D-2 Stable entity refs.** `edges.from_ref/to_ref` and evidence use `file:<path>`, `sym:<fqn>`, `req:<code>`, `rule:<code>`, `table:<lower-case name>`, `step:<process>#<n>`. They are natural keys, so they mean the same thing in every snapshot; resolving one needs a snapshot id. `refResolver` validates them. Overlay projection uses the same refs.

**D-3 Content-addressed file storage.** File contents live in `blobs` (SHA-256) behind the `ArtifactStorage` interface (database implementation now). Unchanged files are stored once across snapshots. **Not implemented:** automatic retention/pruning of old snapshots. Snapshots referenced by an analysis must never be pruned; a future job should keep the newest N per source plus every pinned one.

**D-4 Incremental sync re-derives the whole graph.** "Rebuild the affected graph" is ill-defined because fan-in, step mapping and edges are global. Sync fetches only changed files (compare API) and then re-parses everything from stored content and writes a complete new snapshot. This is simple, deterministic (same SHA ⇒ same graph) and measured at 6.5 s for 20 changed files in a 2,000-file repository. Cost: a new full set of derived rows per sync.

**D-5 Position matters.** Prototype screens and step file lists follow definition/rank order (schema order, rule-code document order, best-match-first files). The graph and database therefore store `position` (tables, fields, rule codes) and `evidence.rank` (step mappings) instead of sorting alphabetically. Facts used in golden tests are order-independent.

**D-6 Snapshot activation.** Statuses `BUILDING → ACTIVE → SUPERSEDED` or `FAILED`. Validation before activation: non-empty, no dangling edges, confidence in [0,1], and a >50 % collapse of the file count against the previous active snapshot is refused. Activation swaps inside one transaction; a partial unique index guarantees one `ACTIVE` snapshot per source; a second partial unique index guarantees one in-flight sync run per source.

## Access, identity, secrets

**D-7 Scopes.** The plan lists `openid profile email read_user`. `read_user` cannot tell Lens which projects a user may read, so Lens also requests **`read_api`** and checks `GET /projects/:id` with the user's own token. Refresh is attempted once on 401. Failure means "no access".

**D-8 OIDC client credentials come from the environment**, not the database. The plan's `gitlab_connections` stored them encrypted, but nobody could then sign in to configure the app. The table now holds only non-bootstrap settings.

**D-9 Visibility cache.** 10 minutes per (user, source), fail-closed. Consequence: a revoked GitLab permission can persist for up to 10 minutes. Break-glass Admins have no GitLab account and are trusted for source visibility.

**D-10 Project visibility.** Change projects are shared with everyone who can see the project's source. Contributors and above can analyse any such project; deletion is the creator or an Admin. Not specified by the plan.

**D-11 Roles for new users.** New users are Viewers. Admin only via `LENS_BOOTSTRAP_ADMINS` (explicit e-mails) or the optional break-glass account. The development seed refuses to run in production.

**D-12 Secrets.** AES-256-GCM with a versioned key ring (`LENS_ENCRYPTION_KEYS="id:base64,id2:base64"`); the first key encrypts, all listed keys decrypt (rotation). Not implemented: an automated re-encryption job (`needsRotation()` exists; see runbook for the manual procedure).

**D-13 Cookies.** The session cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` with the `__Secure-` prefix when `AUTH_URL` is https. Production must set `AUTH_URL` to the https URL.

## Ingestion and heuristics (prototype parity)

**D-14 Prototype heuristics are ported, not reinterpreted.** Requirement/rule-code/process detection, step→requirement/code/rule/table mapping, impact scoring and pack generation are ports of the prototype functions, **differentially tested against the prototype's own code on the same repository** (`docs/PROTOTYPE-MAP.md`). Deliberate differences:

1. Requirement separators also accept a colon with no leading space (`BR-004: Title`), per plan §10.3.
2. Block comments are **not** nested (the first closing marker ends the comment). ABL does nest them, but real headers contain text such as `database/schema/*.df`, which would swallow the rest of the file. The prototype ignores nesting too.
3. Lower-case namespaces in `AS ns.Type` are recognised (the prototype only matched a capital first letter). On the fixture this adds one correct `uses` edge and one fan-in count.
4. Ties in impact scoring and ripple ordering are broken by path (the prototype used insertion order) so results are deterministic.
5. Each relationship gets an origin and confidence: explicit requirement/files/rules → `EXPLICIT` 1; index-aligned requirement → `INFERRED` 0.9; word-overlap requirement → the overlap ratio; file match → `min(0.95, 0.4 + 0.1 × score)`; rule via requirement trace → 0.9; table via mapped file → 0.7. These numbers are heuristic labels, not calibrated probabilities. `db-read`/`db-write` are separate edges (the prototype used one `db-read/write` type). `.t` files are treated as procedures. Test→test `tests` edges are kept, as in the prototype.
6. Comment/string-aware scanning for `RUN`, `FIND`, `CREATE`, `USING`, `NEW` and friends; sources are decoded as UTF-8 with a Windows-1252 fallback.

**D-15 Commit references.** The plan's default `\b(TSK\d{5,}|[A-Z][A-Z0-9]+-\d+)\b` also matches `UTF-8`, `SHA-256` and requirement ids. It is kept as the default (plan), but tickets link to commits only when the key appears in an *imported* ticket (or an explicit commit column).

**D-16 History depth.** Per-commit diff calls dominate sync time on large histories. `history()` is limited to the newest 500 commits by default. Churn ignores commits that touch more than 20 files.

**D-17 Personal-data detection is heuristic** (header names plus e-mail, South-African ID number with a valid date, and phone patterns inside values, ≥ 30 % of sampled values). It reduces risk; it is not a guarantee. Free-text columns can hide personal data in other forms.

## AI

**D-18 Reproducibility means recorded inputs, not identical output.** An analysis stores source, Git SHA, snapshot, document versions, provider, model, prompt and schema versions, token counts, duration and the tool calls made (names and inputs only). Re-running produces a *new version*; a model may answer differently.

**D-19 Grounding is enforced in code, not only in the prompt.** After schema validation, every impact path, evidence reference, process name and test-called method is resolved against the pinned snapshot. One corrective pass is offered; anything still ungrounded is **removed and reported** (never shown as fact). Methods called in tests must exist or be proposed by the plan (with an allow-list of ABL/Assert built-ins, so this check can miss or over-block edge cases).

**D-20 Untrusted data.** Every piece of repository, document, ticket, incident and tool text is redacted, then fenced with a per-request random nonce; the system prompt tells the model fenced text has no authority. This reduces prompt-injection risk; it cannot eliminate it. The defence in depth is the schema, the grounding check and the fact that the AI cannot write to the graph.

**D-21 Per-source opt-in.** Sending code to an external model needs an Admin to enable it per source (`aiAllowed`). Analysis has a token ceiling (`LENS_TOKEN_BUDGET`, default 400k).

**D-22 One provider.** `LENS_AI_PROVIDER` accepts only `anthropic`; another value is an error rather than silently ignored. Default model `claude-sonnet-5-5`, overridable with `LENS_MODEL`.

**D-23 No lifecycle for `AI_SUGGESTED` edges yet.** The origin exists in the model and the UI labels it, but nothing creates such edges and there is no accept-to-`MANUAL` flow.

## UI and accessibility

**D-24 Colours.** The plan's olive `#6B8A13` gives white text only 3.98:1, below WCAG AA. Filled olive surfaces use `#5A7610` (5.4:1); `#6B8A13` is kept for non-text strokes. Dark-mode filled buttons use dark text on `#7FA317`.

**D-25 Fonts.** Headings use Trebuchet MS and body Segoe UI/Tahoma (plan §20). The app makes no external font requests. The prototype's pack templates still contain a Google Fonts `<link>`; inside the sandboxed frame the response policy blocks it, so packs use the fallback stack.

**D-26 Theme** is a class on `<html>`, stored per user (and in a cookie), with `localStorage` before sign-in; it never follows `prefers-color-scheme` (plan §20). The selected theme is passed to pack frames as `data-theme`.

**D-27 Pack viewer isolation.** Pack HTML is served from `/api/pack-frame` with its own response policy (`sandbox allow-scripts`, `default-src 'none'`, no network) and shown in an iframe with `sandbox="allow-scripts"`: no same-origin access, so it cannot read the app's cookies or storage (tested in a browser).

**D-28 PDF requirements are not supported** (plan §14.1). The UI says so before upload and the server rejects them with the same message. DOCX extraction checks archive size and entry count first.

## Operations

**D-29 Queue.** pg-boss on the same PostgreSQL, `short` policy (one queued job per run/analysis id), retries with backoff, dead-letter queues, graceful drain on SIGTERM. Handlers are idempotent so redelivery after a crash resumes work (tested with a simulated crash). The web app holds a send-only connection (no supervision or scheduling) with a small pool.

**D-30 Framework versions.** Next.js 15.5 and Auth.js **v5 beta** (`next-auth@5.0.0-beta`). The beta is a risk to watch; the surface used is small (database sessions, one OIDC provider, adapter) and isolated in `apps/web/src/auth.ts`.

**D-31 Performance.** Measured on a synthetic 2,000-file repository with the GitLab client faked in-process (so no network latency): see `docs/PERFORMANCE.md` for the numbers and the recorded environment. They are a floor for your environment, not a promise about it. The immutable snapshot graph and file contents are cached in the server process (small LRU); the imported-history overlay (tickets, incidents) is re-read per request. Two performance bugs were found by the harness and fixed: a quadratic edge scan when building the impact view, and one database round-trip per file when loading contents (now batched through the optional `ArtifactStorage.getMany`).

## Known gaps

- No automatic snapshot retention/pruning (D-3) and no automated key re-encryption (D-12).
- No scheduled or webhook-driven sync. `syncSource(sourceId, { full })` and the job payloads are ready for it.
- No UI for manual step→code mapping or for reviewing unresolved manual mappings, although the services (`addManualEdge`, `unresolvedManualEdges`) are implemented and tested. Incident placement is derived, not editable.
- No lifecycle for `AI_SUGGESTED` relationships (D-23).
- Explore, History and Projects have no pagination (adequate at the tested scale).
- No ESLint configuration.
- Sign-in against real GitLab, live Anthropic calls, and container builds were not exercised (see README, *What is and is not verified*).
