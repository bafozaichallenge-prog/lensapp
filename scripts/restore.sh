#!/usr/bin/env bash
# Restore a dump into an EMPTY database. Usage: TARGET_URL=postgres://... scripts/restore.sh backups/lens-<stamp>.dump
# Stop the web and worker first. Restoring over a database that has data is refused.
set -euo pipefail
DUMP="${1:?path to a .dump file}"; : "${TARGET_URL:?TARGET_URL is required}"
[ -f "$DUMP.sha256" ] && (cd "$(dirname "$DUMP")" && sha256sum -c "$(basename "$DUMP").sha256")
URL="${TARGET_URL%%\?*}"
if [ "$(psql "$URL" -Atc "select count(*) from information_schema.tables where table_schema='public'")" != "0" ]; then echo "Target database is not empty; refusing." >&2; exit 1; fi
pg_restore --no-owner --no-privileges --exit-on-error --dbname "$URL" "$DUMP"
echo "Restored $DUMP"
