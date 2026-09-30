# Changelog

One entry per plan milestone. "Gate" says how each milestone's *done when* criteria were checked; anything not checked is stated.

## M0 — Prototype contract and golden fixture
- Extracted the *BafozAIChallenge-project* repository (108 files: 93 ABL, schema, docs, exports, git log) and the worked example from the prototype into `test/fixtures`; created `DECISIONS.md` and `docs/PROTOTYPE-MAP.md`.
- The prototype's ingestion, impact scoring and pack generation were run as reference implementations and compared with the ports.
- Gate: the fixture is runnable; the prototype screens map to routes; heuristics are listed with their tests.

## M1 — Foundation, auth and theme
- npm-workspace monorepo, Prisma schema and migrations, Auth.js GitLab OIDC with database sessions, explicit admin bootstrap, optional break-glass, audit log, per-user theme and audience.
- Gate (automated): a new user is a Viewer and the first sign-in is not Admin; bootstrap is audited; role changes are Admin-only and audited; the seed refuses production; preferences persist; sign-in is gated on every page and API route. **Not run:** a sign-in against a real GitLab.

## M2 — Sources, credentials, snapshots
- Encrypted source credentials, source CRUD with GitLab visibility, full/incremental/skip sync with retry and rate-limit handling, progress, history, atomic snapshot activation.
- Gate (automated, fake GitLab over the fixture): 93 ABL files and 11 non-merge commits (with branch names where merges name them) are stored; head SHA recorded; an unchanged head creates no new snapshot; a missing previous SHA and >500 changed files fall back to full; a failed or collapsing sync leaves the previous snapshot active; Viewers cannot sync; inaccessible sources cannot be opened.

## M3 — Core code intelligence
- Class/procedure/include/schema/requirement/rule parsers; edges with origin and confidence; metrics; idempotent ingestion; golden facts with readable diffs.
- Gate: parser unit tests, same input in any order ⇒ identical graph, golden-facts diff reporting, and a differential test against the prototype's ingestion (edges match except one documented improvement).

## M4 — Process intelligence
- Process detection and `process.json` override, step mapping to requirements/code/rules/tables with origin and confidence, custom processes and manual mappings that survive re-syncs.
- Gate: New Business has 7 steps linked to BR-001…BR-007; step 5 lists CollectionInstruction, CollectionService and both collection rules; tables are linked from mapped files; inferred relationships expose origin/confidence; custom processes survive a full re-sync.
- Note: the plan's "7 expected tables" — the schema has 7 tables (+1 sequence); 6 are reached from process steps by the prototype's mapping rule (`ContractAudit` is only used by code outside the mapped files). This matches the prototype.

## M5 — Explore UI
- Overview, search, process pages with the station diagram, all entity pages with evidence, history timeline, source freshness on every source page.
- Gate: browser tests drill process → step → class and show code, rules, tables, incidents, history and the reason for each link.

## M6 — Imports and operational history
- CSV import with column mapping (remembered), personal-data blocking, suffix path resolution, unresolved-path reporting, incident placement.
- Gate: NBJ-127 links to 7b94784; INC-2291 appears on step 5; INC-2318 is unlinked; unresolved references are listed; personal-data columns are dropped unless an Admin keeps them.

## M7 — Deterministic change projects
- Uploads (docx/md/txt/csv/json, PDF refused with a clear message), document versioning, automatic/manual source choice, `impactIn`, cross-check, staleness.
- Gate: with no AI configured a project yields the full chain requirement → source → files → dependents → tests → processes → rules → incidents → tickets, each match keeping its heuristic evidence.

## M8 — AI analysis
- Worker-only client, bounded orientation context, four tools (≤ 12 turns), grounding validator, injection fencing, redaction, Zod schema with one corrective retry, SSE progress, cancellation, token and duration recording.
- Gate (scripted model): valid grounded output for "Last-day debit order collections" including INC-2291 evidence; invented paths/methods are removed; tasks split Taskmanager/Jira; Jira CSV is formula-safe; no key ⇒ deterministic result; historical analyses stay pinned. **Not run:** the live Anthropic API.

## M9 — Full project outputs and exports
- Project page in prototype order, audience tabs, stale-source banner, re-run, version list/compare, Markdown/Jira CSV/ABLUnit downloads from the stored analysis.
- Gate: create → analyse → inspect → compare versions → export, reproducing an old analysis after later syncs.

## M10 — Process packs
- Spec builder, explainer/animated/prototype/sandbox-config artefacts, sandboxed viewer, downloads, cache by process + snapshot SHA, wording refinement with a fact-preservation guard.
- Gate: output is byte-identical to the prototype's on the fixture; in a real browser the interactive prototype rejects a monthly debit order on day 31 (NB-COLLECTION-002) and accepts day 25, and activation works only as SUPERVISOR or ADMIN after a passing validation; baseline schema precedes deltas; refinement cannot change rule ids, counts or chip keys.

## M11 — Hardening and production readiness
- Authorisation matrix tests, CSRF/CSP/headers, prompt-injection tests, WCAG 2.2 AA axe checks (light/dark), performance harness, queue retry/dead-letter/crash redelivery tests, structured logs, health checks, backup/restore with a tested drill, Dockerfile/compose/CI, README/runbook.
- Gate: see README, *What is and is not verified*. **Not run:** container build, real GitLab/Anthropic, multi-instance.
