# Backup and restore

PostgreSQL is the system of record for the graph, imported history, analyses, users, sessions and the audit log, and (until an object store is added) for file contents and uploaded documents.

## What a backup contains — and does not
- **Contains:** everything in the `lens` database, including `sources.tokenEnc` (**encrypted** GitLab tokens).
- **Does not contain:** `LENS_ENCRYPTION_KEYS`. **Store the keys separately** (secrets manager / password vault) and back them up on their own schedule. A restored database without the keys can serve everything except source syncs that need a stored token.
- The pg-boss queue tables live in the same database. After a restore, in-flight jobs are redelivered; that is safe.

## Procedure
```bash
# daily (cron / scheduled job)
DATABASE_URL=postgres://lens:…@host/lens npm run backup            # → ./backups/lens-<UTC stamp>.dump (+ .sha256)
# retention: newest 14 kept by default; LENS_BACKUP_KEEP=30 to change
```
Copy dumps off the host (encrypted storage, different failure domain). Suggested retention: 14 daily + 8 weekly + 12 monthly; keep the count consistent with your data-retention policy. Dumps contain code, requirements and history: treat them as sensitive.

## Restore
1. Stop `web` and `worker`.
2. Create an **empty** database (`createdb lens`).
3. `TARGET_URL=postgres://…/lens scripts/restore.sh backups/lens-<stamp>.dump` (verifies the checksum; refuses a non-empty target).
4. Start `migrate` (a no-op if the dump is current), then `web` and `worker`.
5. Confirm: sign in, open a source (banner shows the expected SHA), open an analysis.

## Test-restore drill (do this regularly, e.g. monthly)
```bash
DATABASE_URL=postgres://…/lens ADMIN_URL=postgres://…/postgres scripts/restore-test.sh ./backups
```
It restores the newest dump into a scratch database, compares row counts for sources, snapshots, files, edges, blobs, projects, analyses, users and audit entries with the live database, prints `RESTORE TEST PASSED` or fails, and drops the scratch database. The live database keeps changing, so compare against a dump taken just before, or accept small differences in `audit`/`users`; a mismatch in `snapshots`, `files` or `edges` means the dump is bad.

Verified for this repository: dump → restore into an empty database → identical counts; restore into a non-empty database refused. Record the date and result of each drill.
