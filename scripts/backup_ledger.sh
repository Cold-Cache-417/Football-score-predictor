#!/usr/bin/env bash
# Take a consistent online copy of the forecast ledger and prove it is readable.
#
#   scripts/backup_ledger.sh
#   CALIBRA_BACKUP_DIR=/mnt/backups CALIBRA_BACKUP_KEEP=30 scripts/backup_ledger.sh
#
# `sqlite3 .backup` is safe while the server is writing (it uses SQLite's own
# backup API), so this can run from cron/launchd without stopping the site.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="$ROOT/data/calibra.db"
DEST="${CALIBRA_BACKUP_DIR:-$HOME/.local/share/calibra/backups}"
KEEP="${CALIBRA_BACKUP_KEEP:-14}"

[ -f "$DB" ] || { echo "no ledger at $DB" >&2; exit 1; }
mkdir -p "$DEST"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$DEST/calibra-$STAMP.db"

sqlite3 "$DB" ".backup '$OUT'"

# A backup nobody has opened is not a backup: check integrity and the counts.
CHECK="$(sqlite3 "$OUT" "pragma integrity_check;")"
[ "$CHECK" = "ok" ] || { echo "backup failed integrity check: $CHECK" >&2; exit 1; }
FORECASTS="$(sqlite3 "$OUT" "select count(*) from forecasts;")"
RESULTS="$(sqlite3 "$OUT" "select count(*) from results;")"
echo "backup ok: $OUT forecasts=$FORECASTS results=$RESULTS"

# Keep the newest $KEEP copies.
ls -1t "$DEST"/calibra-*.db 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  rm -f -- "$old"
done
