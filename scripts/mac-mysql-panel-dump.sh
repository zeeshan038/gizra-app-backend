#!/usr/bin/env bash
# Save PHP prod MySQL to a file on your Mac (read-only mysqldump through SSH tunnel).
# Does not SSH into the panel for mysqldump — only the tunnel forwards port 3306.
#
# Terminal A: ./scripts/mac-mysql-panel-tunnel.sh
# Terminal B: ./scripts/mac-mysql-panel-dump.sh ~/Downloads/gizra_mysql_prod.sql
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$HOME/Downloads/gizra_mysql_prod_$(date +%F).sql}"
LOCAL_PORT="${GIZRA_MYSQL_PANEL_LOCAL_PORT:-3308}"
HOST="${GIZRA_PANEL_MYSQL_HOST:-127.0.0.1}"

load_env() {
  if [[ -f "$ROOT_DIR/.env" ]]; then
    local line
    while IFS= read -r line; do
      [[ "$line" =~ ^# ]] && continue
      case "$line" in
        MYSQL_MIGRATION_URL=*|GIZRA_PANEL_MYSQL_*=*)
          export "$line"
          ;;
      esac
    done < "$ROOT_DIR/.env"
  fi
}

load_env

DB_USER="${GIZRA_PANEL_MYSQL_USER:-}"
DB_PASS="${GIZRA_PANEL_MYSQL_PASSWORD:-}"
DB_NAME="${GIZRA_PANEL_MYSQL_DATABASE:-}"

if [[ -n "${MYSQL_MIGRATION_URL:-}" ]]; then
  read -r DB_USER DB_PASS DB_NAME LOCAL_PORT <<<"$(python3 - <<'PY'
import os, urllib.parse
u = os.environ.get("MYSQL_MIGRATION_URL", "")
if not u.startswith("mysql://"):
    print("   ")
    raise SystemExit
p = urllib.parse.urlparse(u)
print(p.username or "", p.password or "", (p.path or "").lstrip("/").split("?")[0], p.port or 3308)
PY
)"
fi

if [[ -z "$DB_USER" || -z "$DB_PASS" || -z "$DB_NAME" ]]; then
  echo "Set MYSQL_MIGRATION_URL in .env (port 3308, URL-encoded password), then retry."
  exit 1
fi

DB_PASS="$(python3 -c "import urllib.parse,sys; print(urllib.parse.unquote(sys.argv[1]))" "$DB_PASS")"

if ! nc -z "$HOST" "$LOCAL_PORT" 2>/dev/null; then
  echo "Nothing on ${HOST}:${LOCAL_PORT}. Start: ./scripts/mac-mysql-panel-tunnel.sh"
  exit 1
fi

mkdir -p "$(dirname "$OUT")"
echo "Dumping ${DB_NAME} → ${OUT} (via localhost:${LOCAL_PORT})…"

docker run --rm \
  -e MYSQL_PWD="$DB_PASS" \
  mariadb:10.11 \
  mysqldump -h host.docker.internal -P"$LOCAL_PORT" -u"$DB_USER" \
  --single-transaction --routines --triggers --default-character-set=utf8mb4 \
  "$DB_NAME" > "$OUT"

size="$(wc -c < "$OUT" | tr -d ' ')"
if [[ "$size" -lt 1000 ]]; then
  echo "Dump looks empty (${size} bytes). Check credentials and tunnel."
  exit 1
fi

echo "OK: $(ls -lh "$OUT" | awk '{print $5}') — next:"
echo "  ./scripts/mysql-docker-import.sh \"$OUT\""
echo "  # set MYSQL_MIGRATION_URL=mysql://root:migrate_local_root@127.0.0.1:3306/gizra_db"
echo "  ./scripts/migrate-on-mac.sh"
