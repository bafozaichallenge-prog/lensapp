# Runbook

## Where to look
| Symptom | Look at |
|---|---|
| Site down / 503 | `GET /api/health` (web), `GET :3001/health` (worker); `docker compose logs web worker postgres` |
| "Sync now" never finishes | *Explore → source → Sync history*; `sync_runs` (status, log); worker logs (`job sync …`) |
| Analysis stuck "Analysing" | `analyses` row status and `job_progress`; worker logs; is `ANTHROPIC_API_KEY` set and the source's AI box ticked? |
| Someone cannot see a source | They need GitLab read access to that project; visibility is cached for 10 minutes |
| Odd behaviour after a change | *Users → Recent activity* (audit log) |

Logs are JSON, one object per line, with secrets and prompt text redacted. Job ids are pg-boss ids; run ids are `sync_runs.id`.

## Common procedures

**Restart the worker.** `docker compose restart worker`. It drains for up to 30 s on SIGTERM. Jobs in flight are redelivered to the new worker and resumed (handlers are idempotent). A finished job is ignored if redelivered.

**A sync is stuck in an in-flight state.** Only one in-flight run per source is allowed, so a stuck run blocks new syncs. If the worker is healthy it will retry it (`retryLimit` 3 with backoff). To force-fail it: `update sync_runs set status='FAILED', log='manually failed', "finishedAt"=now() where id='…';` then `update sources set status='IDLE' where id='…';`. The active snapshot is unaffected either way.

**Failed jobs.** After retries a job lands in `sync-dead`, `analysis-dead` or `pack-refine-dead` (pg-boss schema `pgboss`). Inspect with `select * from pgboss.job where name like '%-dead' order by created_on desc;`.

**Rotate `LENS_ENCRYPTION_KEYS`.** 1) Add a new key **in front**: `k2:<new>,k1:<old>`; restart web and worker. New credentials use k2; k1 still decrypts. 2) Re-save each source token (Explore → source → credentials) or run a one-off script that calls `decrypt` then `encrypt` for every non-null `sources.tokenEnc` (`needsRotation()` in `@lens/core` tells you which). 3) When no value references k1 (`select count(*) from sources where "tokenEnc" like 'v1.k1.%'` is 0), remove k1. Never remove a key that is still referenced.

**Rotate a GitLab source token.** Explore → source → set a new token (audited as a credential change, value never logged).

**Add or change an Admin.** Add the e-mail to `LENS_BOOTSTRAP_ADMINS` and have the person sign in again, or (as an existing Admin) *Users → role*. Lens refuses to demote the last Admin.

**Disable break-glass.** Unset `LENS_BREAK_GLASS_HASH` and restart web. Existing break-glass sessions expire within 8 hours; delete them for immediate effect: `delete from sessions where "userId" in (select id from users where email='breakglass@lens.local');`.

**Prune old snapshots (manual, until automated).** Never delete a snapshot referenced by an analysis (`analyses.graphSnapshotId`) or the `ACTIVE` one. Superseded, unreferenced snapshots can be deleted (`delete from graph_snapshots where status='SUPERSEDED' and id not in (select "graphSnapshotId" from analyses);` cascades their rows); unreferenced `blobs` can then be vacuumed: `delete from blobs b where not exists (select 1 from files f where f."blobSha"=b.sha256);`.

**Upgrade.** `docker compose up --build`: the `migrate` service runs `prisma migrate deploy` before web/worker start. Migrations are additive; take a backup first (`docs/BACKUP-RESTORE.md`).

## Capacity notes
PostgreSQL `max_connections` ≥ ~50 for one web + one worker (the compose file uses 200). Web pool: `connection_limit` in `DATABASE_URL` (compose: 10). Worker runs up to 2 syncs and 2 analyses concurrently (`registerWorkers`). Full sync of a 2,000-file repository took ~5 s against a local database with GitLab faked; real time is dominated by GitLab (archive download and per-commit diffs).
