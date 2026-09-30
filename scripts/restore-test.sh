#!/usr/bin/env bash
# Test-restore drill: restores the newest dump into a scratch database and compares row counts with the source.
# Usage: DATABASE_URL=postgres://.../lens ADMIN_URL=postgres://.../postgres scripts/restore-test.sh [dir]
set -euo pipefail
: "${DATABASE_URL:?}"; : "${ADMIN_URL:?connection to the maintenance database (postgres)}"
DIR="${1:-./backups}"; DUMP="$(ls -1t "$DIR"/lens-*.dump | head -1)"
SRC="${DATABASE_URL%%\?*}"; SCRATCH="lens_restore_test_$$"
psql "$ADMIN_URL" -qc "CREATE DATABASE $SCRATCH"
trap 'psql "$ADMIN_URL" -qc "DROP DATABASE IF EXISTS $SCRATCH" >/dev/null' EXIT
BASE="${SRC%/*}"
TARGET_URL="$BASE/$SCRATCH" "$(dirname "$0")/restore.sh" "$DUMP"
counts() { psql "$1" -Atc "select 'sources='||(select count(*) from sources)||' snapshots='||(select count(*) from graph_snapshots)||' files='||(select count(*) from files)||' edges='||(select count(*) from edges)||' blobs='||(select count(*) from blobs)||' projects='||(select count(*) from change_projects)||' analyses='||(select count(*) from analyses)||' users='||(select count(*) from users)||' audit='||(select count(*) from audit_log)"; }
A="$(counts "$SRC")"; B="$(counts "$BASE/$SCRATCH")"
echo "source : $A"; echo "restore: $B"
[ "$A" = "$B" ] && echo "RESTORE TEST PASSED" || { echo "RESTORE TEST FAILED: counts differ" >&2; exit 1; }
