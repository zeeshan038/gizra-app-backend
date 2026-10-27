#!/usr/bin/env bash
# Count rows in PHP prod MySQL via SSH tunnel (read-only). No commands on the panel except the tunnel.
#
# Terminal: ./scripts/mac-mysql-panel-tunnel.sh
# Then:     ./scripts/mac-mysql-panel-count.sh orders
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TABLE="${1:-orders}"
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

# Do not use $USER — macOS sets USER=your login name and breaks URL parsing.
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
  echo "Set in gizra-backend/.env (URL-encode * as %2A in password):"
  echo "  MYSQL_MIGRATION_URL=mysql://DB_USER:DB_PASS@127.0.0.1:3308/DB_NAME"
  echo "Or: GIZRA_PANEL_MYSQL_USER, GIZRA_PANEL_MYSQL_PASSWORD, GIZRA_PANEL_MYSQL_DATABASE"
  exit 1
fi

DB_PASS="$(python3 -c "import urllib.parse,sys; print(urllib.parse.unquote(sys.argv[1]))" "$DB_PASS")"

if ! nc -z "$HOST" "$LOCAL_PORT" 2>/dev/null; then
  echo "Nothing on ${HOST}:${LOCAL_PORT}. Start: ./scripts/mac-mysql-panel-tunnel.sh"
  exit 1
fi

docker run --rm \
  -e MYSQL_PWD="$DB_PASS" \
  mariadb:10.11 \
  mariadb -h host.docker.internal -P"$LOCAL_PORT" -u"$DB_USER" "$DB_NAME" \
  -e "SELECT COUNT(*) AS c FROM \`${TABLE}\`;"
