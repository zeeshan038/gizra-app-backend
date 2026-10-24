#!/usr/bin/env bash
# MySQL → Postgres migration from your Mac (recommended if SSH tunnels to MySQL fail).
#
# Terminal 1 — Postgres prod via SSH:
#   ./scripts/mac-db-tunnel.sh
#
# MySQL source (pick one — all from Mac; PHP panel stays read-only):
#   A) Snapshot (recommended): panel tunnel → dump → local Docker
#      ./scripts/mac-mysql-panel-tunnel.sh
#      ./scripts/mac-mysql-panel-dump.sh ~/Downloads/gizra_mysql_prod.sql
#      ./scripts/mysql-docker-import.sh ~/Downloads/gizra_mysql_prod.sql
#      MYSQL_MIGRATION_URL=mysql://root:migrate_local_root@127.0.0.1:3306/gizra_db
#   B) Live read through tunnel (no dump file):
#      ./scripts/mac-mysql-panel-tunnel.sh
#      MYSQL_MIGRATION_URL=mysql://USER:PASS@127.0.0.1:3308/DB_NAME  (encode * as %2A)
#   C) Old local backup dump only if you cannot reach panel MySQL
#
# Terminal 2:
#   cd gizra-backend
#   npm install
#   ./scripts/migrate-on-mac.sh
#   ./scripts/migrate-on-mac.sh --apply --truncate --confirm
#
# WARNING: --apply --truncate writes to DATABASE_URL in .env (usually prod Postgres over tunnel).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo "Missing .env — copy from env.mac.example"
  exit 1
fi

# Load MYSQL_MIGRATION_URL from .env (last wins; ignore commented lines)
env_mysql="$(grep -E '^MYSQL_MIGRATION_URL=' "$ROOT_DIR/.env" 2>/dev/null | grep -v '^#' | tail -1 | sed 's/\r$//' || true)"
if [[ -n "$env_mysql" ]]; then
  export "${env_mysql?}"
fi

if [[ -z "${MYSQL_MIGRATION_URL:-}" ]]; then
  for port in 3307 3306; do
    if nc -z 127.0.0.1 "$port" 2>/dev/null; then
      export MYSQL_MIGRATION_URL="mysql://root:migrate_local_root@127.0.0.1:${port}/gizra_db"
      break
    fi
  done
fi
export MYSQL_MIGRATION_URL="${MYSQL_MIGRATION_URL:-mysql://root:migrate_local_root@127.0.0.1:3307/gizra_db}"

PG_LOCAL_PORT="${GIZRA_DB_LOCAL_PORT:-5434}"
if ! command -v pg_isready >/dev/null 2>&1 || ! pg_isready -h 127.0.0.1 -p "$PG_LOCAL_PORT" -q 2>/dev/null; then
  echo "Postgres not ready on 127.0.0.1:${PG_LOCAL_PORT}"
  echo "Start tunnel in another terminal: ./scripts/mac-db-tunnel.sh"
  echo "(If local Docker uses 5434, use GIZRA_DB_LOCAL_PORT=5435 for the tunnel and DATABASE_URL.)"
  exit 1
fi

# Local `docker compose` often publishes gizra-postgres on 5434 — same port as the SSH tunnel.
# pg_isready alone cannot tell them apart; migrating with --apply would update the wrong database.
if [[ " $* " == *" --apply "* ]]; then
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'gizra-postgres'; then
    mapped="$(docker port gizra-postgres 5432 2>/dev/null | head -1 || true)"
    if [[ "$mapped" == *":${PG_LOCAL_PORT}"* ]]; then
      echo ""
      echo "FAIL: Local Docker container gizra-postgres is listening on 127.0.0.1:${PG_LOCAL_PORT}."
      echo "Your DATABASE_URL likely points at Mac Postgres, NOT Hetzner prod."
      echo ""
      echo "  docker compose -f docker-compose.yml down   # or stop only gizra-postgres"
      echo "  ./scripts/mac-db-tunnel.sh                  # then migrate again"
      echo "Or use tunnel port 5435: GIZRA_DB_LOCAL_PORT=5435 + DATABASE_URL @127.0.0.1:5435"
      echo "For prod load on the VPS use: ./scripts/migrate-on-server.sh"
      exit 1
    fi
  fi
fi

if [[ ! -f "$ROOT_DIR/node_modules/mysql2/package.json" ]]; then
  echo "Installing dependencies…"
  npm install
fi

mysql_port="${MYSQL_MIGRATION_URL##*:}"
mysql_port="${mysql_port%%/*}"
if ! nc -z 127.0.0.1 "$mysql_port" 2>/dev/null; then
  echo "MySQL not reachable at ${MYSQL_MIGRATION_URL}"
  echo ""
  echo "Start local MySQL from a PHP dump:"
  echo "  ./scripts/mysql-docker-import.sh /path/to/gizra_mysql_prod.sql"
  echo "Then set in .env (3306 default, or 3307 if you used GIZRA_MYSQL_DOCKER_PORT=3307):"
  echo "  MYSQL_MIGRATION_URL=mysql://root:migrate_local_root@127.0.0.1:3306/gizra_db"
  exit 1
fi

echo "DATABASE_URL from .env → Postgres @127.0.0.1:${PG_LOCAL_PORT} (confirm this is the SSH tunnel, not local Docker)"
echo "MYSQL_MIGRATION_URL → ${MYSQL_MIGRATION_URL}"
if [[ " $* " == *" --apply "* && " $* " == *" --truncate "* ]]; then
  echo ""
  echo "⚠️  This will TRUNCATE and reload tables in your .env DATABASE_URL database."
  sleep 2
fi

exec npm run db:migrate-from-mysql -- "$@"
