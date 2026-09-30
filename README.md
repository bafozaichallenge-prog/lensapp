# Lens

Lens is an internal web app for MIP. It reads a Progress OpenEdge ABL codebase from GitLab, plus ticket and incident CSV exports, and builds a **versioned system knowledge graph**. It uses that graph to explain the system to business analysts, developers, QA and architects, and to turn a business change request into a grounded impact assessment, plan, risks, tasks and tests.

- **Facts come from deterministic ingestion.** AI interprets the graph; it never becomes repository truth.
- **Every analysis is bound to the exact graph snapshot** (Git SHA, model, prompt version, document versions) it was produced from, and stays valid history when the repository moves on.
- **It stays useful with no AI key:** you still get the deterministic impact chain (files → dependents → tests → processes → rules → tables → incidents → tickets).

Lens analyses and explains. It does not run OpenEdge, provision sandboxes, apply changes or touch the repository.

## Quick start (demo, no GitLab needed)

```bash
cp .env.example .env
# edit .env: POSTGRES_PASSWORD, AUTH_SECRET (openssl rand -base64 32),
#            LENS_ENCRYPTION_KEYS ("k1:$(openssl rand -base64 32)"),
#            LENS_BREAK_GLASS_HASH (npm run break-glass:hash -- 'a long demo password')
docker compose --profile demo up --build
```

Open <http://localhost:3000>, expand **Local administrator (break-glass)** on the sign-in page and sign in with the password you hashed. The demo loads the bundled *BafozAIChallenge* sample repository (a New Business process with 7 steps, 93 ABL files), its tickets and incidents, and the worked example **“Last-day debit order collections”**, clearly marked *Example / Seed data* (delete it from its project page; that does not affect repository-derived data).

> The demo source has no GitLab project behind it, so *Sync now* is for real sources. See below.

> **Status of the container files:** the Dockerfile and `docker-compose.yml` were written and every step they run was verified separately (standalone build, worker bundle, migrations, seed, backup/restore), but there was no Docker daemon where they were authored, so `docker compose build` has **not** been run. Expect to fix small things on first build.

## Local development

Requirements: Node 22, PostgreSQL 16. No Python anywhere in build, runtime or tooling.

```bash
npm install
export DATABASE_URL=postgresql://lens:lens@localhost:5432/lens
npx prisma migrate deploy --schema packages/storage/prisma/schema.prisma
npm run seed                       # demo data (development only)
npm -w @lens/web run dev           # http://localhost:3000
npx vite-node apps/worker/src/main.ts   # jobs (sync, analysis, pack wording) run here
```

Tests (`npm test`) need the same `DATABASE_URL`; database-backed and browser tests skip themselves when PostgreSQL or Chromium is unavailable. `npm run test:e2e` builds the web app first. See *Testing* below.

## Setting it up for real

### 1. Sign-in (GitLab OIDC)

Create an OAuth application in GitLab:

- Redirect URI: `<AUTH_URL>/api/auth/callback/gitlab`
- Scopes: `openid profile email read_user read_api`

Set `GITLAB_BASE_URL` (self-hosted URL or `https://gitlab.com`), `GITLAB_CLIENT_ID`, `GITLAB_CLIENT_SECRET`, and `AUTH_URL` to the public **https** URL (this turns on `Secure` cookies). Sessions are stored in the database and expire after 8 hours of inactivity.

`read_api` is requested in addition to the plan's scopes because Lens checks source visibility with each user's own token (see *Access model*). See `DECISIONS.md` D-7.

### 2. First administrator

Nobody is Admin by default; **the first person to sign in is a Viewer.** Put one or more e-mail addresses in `LENS_BOOTSTRAP_ADMINS` (comma-separated). They become Admin when they next sign in, and that is recorded in the audit log. Admins then manage roles at **Users**.

An optional local *break-glass* Admin exists only if `LENS_BREAK_GLASS_HASH` is set (`npm run break-glass:hash -- '<password ≥ 12 chars>'`). It is rate-limited (5 attempts/minute/client), audited, and creates the same 8-hour database session as OIDC.

### 3. Source credentials and syncing

An Admin or Maintainer adds a **system source** (GitLab project ID, path, branch, vertical, optional path filters, optional commit-reference regex) under *Explore the system → Add system source*.

- Preferred: a GitLab **project or group access token** with `read_api` and `read_repository`, stored **AES-256-GCM encrypted** with `LENS_ENCRYPTION_KEYS`. It is never returned to the browser, logged, or put in a prompt.
- Fallback: with no source token, the user who clicks *Sync now* has their own GitLab token used for that sync only.

**Sync now** queues a job: first sync is full; later syncs fetch only changed files (falling back to a full sync when the previous SHA is gone after a force-push, or more than 500 files changed) and then rebuild the graph. A second click while a run is in flight joins that run. A failed or invalid sync **never replaces the active snapshot**. Progress streams to the page. `syncSource(sourceId, { full })` is the single entry point a scheduler or webhook can call later.

### 4. Tickets and incidents

Maintainers import CSVs from the source card: pick columns (remembered per source and kind), see any columns that look like personal data (ID numbers, phone numbers, e-mail addresses; **dropped by default, only an Admin can keep them**), import, then review file names that could not be matched to source paths.

### 5. AI (optional)

Set `ANTHROPIC_API_KEY` (and optionally `LENS_MODEL`, default `claude-sonnet-5-5`). The key is read by the **worker only**. An Admin must additionally tick *Allow AI analysis of this source*: sending repository content to an external model is a per-source decision. With no key, or with the box unticked, analyses complete with deterministic findings and say why.

What reaches the model is bounded and minimised: an orientation context (architecture notes, processes, requirements, rules, tables, a file index, recent history, the deterministic pre-analysis), then tool calls (`search_code`, `read_file` ≤ 220 lines, `get_node`, `history`; ≤ 30,000 characters each; ≤ 12 turns). Secrets and personal data are redacted first; repository, document, ticket and incident text is fenced as untrusted data; the reply must validate against a Zod schema and every path, id and method it names is checked against the pinned snapshot: findings that cannot be grounded are removed and reported, not shown as fact. See `docs/SECURITY.md`.

## Access model

Two dimensions, both checked on the server for every action:

```text
Can view a source  =  signed in  AND  the user's GitLab account can read that project
What they can do   =  their Lens role
```

| Role | Can |
|---|---|
| Admin | everything: users and roles, credentials, sources, AI enablement, keeping personal-data columns |
| Maintainer | add/sync sources, import tickets and incidents, add/remove processes |
| Contributor | create and analyse change projects, refine pack wording, download |
| Viewer | read everything they can see, download packs and plans |

GitLab answers are cached per user and source for 10 minutes and **fail closed** (a GitLab error means "no access"). Audience (business analyst / developer / QA / architect) and theme are preferences, not permissions. Every privileged action is audited.

## Architecture

```text
GitLab / CSV ──► deterministic ingestion ──► versioned graph snapshots (PostgreSQL)
                                                   │
                        ┌──────────────────────────┼──────────────────────────┐
                     Explore                 change-impact engine        process packs
                                                   │
                                                  AI (worker only) ──► plan · tasks · tests
```

| Path | What it is |
|---|---|
| `apps/web` | Next.js 15 (App Router, server components/actions), Auth.js v5, the prototype's CSS |
| `apps/worker` | pg-boss worker: `sync`, `analysis`, `pack-refine` jobs |
| `packages/core` | types, stable entity refs, authorisation matrix, AES-256-GCM, CSV-safe export |
| `packages/ingest` | ABL/schema/requirement/process parsers and step mapping (`parseSource` is the stable interface a future XREF-based parser can replace) |
| `packages/graph` | canonical facts and diffs, validation, snapshot lifecycle |
| `packages/impact` | `impactIn`, tokenisation, incident placement |
| `packages/gitlab` | typed client (retry/backoff, 4-way concurrency), sync planner, `syncSource` |
| `packages/ai` | schema, grounding validator, prompt fencing, redaction, tool loop, Anthropic client, exports |
| `packages/pack` | process spec, sandbox config, the three HTML templates, wording-refinement guard |
| `packages/storage` | Prisma schema/migrations, `ArtifactStorage` (database now, object storage later), snapshot persistence |
| `packages/services` | all business logic and authorisation; used by web and worker |
| `packages/queue` | pg-boss queues and worker registration |

Storage model in one paragraph: **snapshot rows** (files, symbols, edges, requirements, processes, commits, metrics) are immutable once a snapshot is active (enforced by database triggers), file contents are content-addressed so unchanged files are stored once, and at most one snapshot per source is `ACTIVE` (enforced by a partial unique index). Things that must survive a re-sync (custom processes, manual mappings, tickets, incidents, pack wording) live in an **overlay** keyed by stable entity refs (`file:<path>`, `req:BR-001`, …) and are re-projected onto each new snapshot; a manual mapping whose target disappears is flagged for review, never silently dropped.

Every relationship carries an **origin** (`EXPLICIT`, `INFERRED`, `MANUAL`, `AI_SUGGESTED`), a confidence, and the reason for it; the UI shows *CONFIRMED* only for what the code establishes directly.

## Operations

- **Health:** web `GET /api/health`, worker `GET :3001/health` (both used by the container health checks).
- **Logs:** structured JSON on stdout, secret- and prompt-redacted.
- **Backups:** `npm run backup`, `scripts/restore.sh`, `scripts/restore-test.sh`; procedure, retention and the test-restore drill are in `docs/BACKUP-RESTORE.md`. Keep `LENS_ENCRYPTION_KEYS` separately: a database dump alone cannot decrypt source tokens.
- **Runbook** (stuck syncs, worker restarts, key rotation, failed jobs): `docs/RUNBOOK.md`.
- **Connections:** PostgreSQL needs `max_connections` ≥ ~50 for one web + one worker; the compose file sets 200.

## Testing

```bash
npm test                 # everything: unit, real-PostgreSQL service tests, worker/queue tests, browser tests
npm run typecheck        # + npm -w @lens/web run typecheck
npm run test:e2e         # builds the web app, then runs the 41 browser tests
npm run perf             # 2,000-file performance harness (see docs/PERFORMANCE.md)
```

The golden fixture is the *BafozAIChallenge-project* repository exactly as embedded in the prototype (`test/fixtures/bafoz`). The ingestion, impact analysis and pack generation were **differentially tested against the prototype's own code** run on the same repository (`docs/PROTOTYPE-MAP.md`); the pack output is byte-identical, the graph identical apart from one documented improvement.

## What is and is not verified

Verified by automated tests in this repository: ingestion and heuristics (parity with the prototype), snapshot lifecycle and atomic activation, single-flight sync, incremental/full/skip/force-push paths, failed-sync safety, custom-process and manual-mapping survival across syncs, authorisation matrix (roles × operations), visibility (fail closed, TTL, revocation), credential encryption and non-disclosure, imports and personal-data handling, prompt-injection fencing and grounding, the AI loop with a scripted model, cancellation, analysis immutability and staleness, packs (including the interactive prototype in a real browser), the queue (retry, dead-letter, redelivery after a simulated crash), the web app in a real browser (CSP, CSRF, roles, themes, keyboard, 390 px layout, axe WCAG 2.2 AA in light and dark), backup/restore, and performance on a synthetic repository.

**Not verified here, and needs your environment:**

- Sign-in against a real GitLab instance (GitLab is faked at the HTTP level in tests; the OIDC redirect flow itself was not run) and real GitLab API behaviour (rate limits, large histories).
- Live calls to the Anthropic API (the model is scripted in tests). Analysis quality on real requirements is unmeasured.
- `docker compose build`/`up` (no Docker daemon was available), TLS/`Secure`-cookie behaviour in a browser, multi-instance deployment.
- Performance on your real repositories and hardware (`docs/PERFORMANCE.md` records exactly what was measured).

Known gaps (see `DECISIONS.md` for the full list): no automatic snapshot retention/pruning, no scheduled or webhook sync (the entry point is ready), no UI for manual step-to-code mapping or for accepting `AI_SUGGESTED` relationships (the service and model support them), PDF requirements are not supported, no lint configuration.
