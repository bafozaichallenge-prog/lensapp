#!/usr/bin/env bash
# Logical backup of the Lens database (custom format, compressed). Usage: DATABASE_URL=postgres://... scripts/backup.sh [dir]
# The dump contains everything: graph snapshots, file contents (blobs), overlays, analyses, users and ENCRYPTED source credentials.
# It does NOT contain LENS_ENCRYPTION_KEYS: store those separately (password manager / secrets store), or credentials cannot be decrypted after a restore.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
DIR="${1:-./backups}"; mkdir -p "$DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$DIR/lens-$STAMP.dump"
# strip Prisma's ?connection_limit=... style parameters, which pg_dump does not understand
URL="${DATABASE_URL%%\?*}"
pg_dump --format=custom --no-owner --no-privileges --file "$OUT" "$URL"
sha256sum "$OUT" > "$OUT.sha256"
echo "Wrote $OUT ($(du -h "$OUT" | cut -f1))"
# Retention: keep the newest N dumps (default 14 daily). Override with LENS_BACKUP_KEEP.
KEEP="${LENS_BACKUP_KEEP:-14}"
ls -1t "$DIR"/lens-*.dump 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do rm -f "$old" "$old.sha256"; echo "Pruned $old"; done
