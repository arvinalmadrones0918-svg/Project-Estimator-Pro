#!/usr/bin/env bash
# Automatic backup of the Project Estimator Pro SQLite database.
# Schedule via cron, e.g.:  0 2 * * *  /opt/estimator/scripts/backup.sh
set -euo pipefail

# Path to the live database (adjust for your install or Docker volume).
DB_PATH="${DB_PATH:-/app/backend/data.db}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/estimator}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_DIR/estimator-$STAMP.db"

# Use SQLite's online backup API for a consistent copy (falls back to cp).
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_PATH" ".backup '$DEST'"
else
  cp "$DB_PATH" "$DEST"
fi
gzip "$DEST"

# Prune old backups.
find "$BACKUP_DIR" -name 'estimator-*.db.gz' -mtime +"$RETENTION_DAYS" -delete

echo "Backup written: $DEST.gz"
