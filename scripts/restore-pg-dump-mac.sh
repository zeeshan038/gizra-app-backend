#!/usr/bin/env bash
# Restore prod Postgres from a pg_dump custom-format file over Mac SSH tunnel.
#
#   Terminal 1: ./scripts/mac-db-tunnel.sh
#   Terminal 2: ./scripts/restore-pg-dump-mac.sh /path/to/gizra_pg_backup.dump
set -euo pipefail

DUMP="${1:-}"
if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "Usage: $0 /path/to/backup.dump"
  echo "Get from server: scp root@167.233.245.44:/root/gizra_pg_backup_*.dump ."
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
chmod +x "$ROOT_DIR/scripts/read-db-password-from-env.sh"
PW="$("$ROOT_DIR/scripts/read-db-password-from-env.sh" "$ROOT_DIR/.env")"

if ! pg_isready -h 127.0.0.1 -p 5434 -q 2>/dev/null; then
  echo "Start ./scripts/mac-db-tunnel.sh first."
  exit 1
fi

echo "This will DROP and restore objects in gizra_db from:"
echo "  $DUMP"
echo "Continue in 5s (Ctrl+C to cancel)…"
sleep 5

export PGPASSWORD="$PW"
pg_restore -h 127.0.0.1 -p 5434 -U postgres -d gizra_db --clean --if-exists --no-owner "$DUMP"
echo "Restore finished. Verify: psql -h 127.0.0.1 -p 5434 -U postgres -d gizra_db -c 'SELECT COUNT(*) FROM users;'"
