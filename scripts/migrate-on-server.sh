#!/usr/bin/env bash
# Run MySQL → Postgres migration ON the Hetzner VPS.
# Prefer Mac: ./scripts/migrate-on-mac.sh
#
#   export MYSQL_MIGRATION_URL='mysql://root:migrate_local_root@172.17.0.1:3306/gizra_db'
#   ./scripts/migrate-on-server.sh --apply --truncate --confirm
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

chmod +x "$ROOT_DIR/scripts/read-db-password-from-env.sh" \
  "$ROOT_DIR/scripts/read-compose-internal-db-url.sh" \
  "$ROOT_DIR/scripts/docker-compose.sh"
node scripts/prepare-compose-env.js

if ! grep -qE '^GIZRA_DATABASE_URL_INTERNAL=postgresql://[^:]+:[^@]+@postgres:5432/' "$ROOT_DIR/.env.compose"; then
  echo "FAIL: .env.compose missing GIZRA_DATABASE_URL_INTERNAL."
  echo "Fix ~/gizra-app-backend/.env — DATABASE_URL must be postgres:5432 or 167.x:5434 with a password, not localhost."
  echo "Then: unset DATABASE_URL POSTGRES_PASSWORD && node scripts/prepare-compose-env.js"
  exit 1
fi

export DATABASE_URL="$("$ROOT_DIR/scripts/read-compose-internal-db-url.sh")"

MYSQL_HOST="${GIZRA_MYSQL_HOST:-172.17.0.1}"
MYSQL_PW="${GIZRA_MYSQL_ROOT_PASSWORD:-migrate_local_root}"
export MYSQL_MIGRATION_URL="${MYSQL_MIGRATION_URL:-mysql://root:${MYSQL_PW}@${MYSQL_HOST}:3306/gizra_db}"

echo "DATABASE_URL → postgres:5432/gizra_db (compose network)"
echo "MYSQL_MIGRATION_URL → ${MYSQL_MIGRATION_URL}"

if ! docker ps --format '{{.Names}}' | grep -qx 'gizra-postgres'; then
  echo "gizra-postgres is not running. Run: npm run deploy:server"
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qE 'gizra-mysql-migrate|mysql|maria'; then
  echo ""
  echo "MySQL is not running on this VPS yet. Migration reads FROM MySQL — Postgres alone is not enough."
  echo "  1) Copy PHP mysqldump to /root/gizra_mysql_prod.sql"
  echo "  2) ./scripts/mysql-docker-import.sh /root/gizra_mysql_prod.sql"
  echo "  3) export MYSQL_MIGRATION_URL='mysql://root:${MYSQL_PW}@${MYSQL_HOST}:3306/gizra_db'"
  echo "  4) Re-run this script (dry run first, then --apply --truncate --confirm)"
  echo ""
  exit 1
fi

echo "Checking MySQL reachability from Docker host (${MYSQL_HOST}:3306)…"
if ! docker run --rm mariadb:10.11 mariadb -h"$MYSQL_HOST" -uroot -p"$MYSQL_PW" -e "SELECT COUNT(*) AS tables FROM information_schema.tables WHERE table_schema='gizra_db';" 2>/dev/null | grep -qE '[0-9]+'; then
  echo "FAIL: cannot query gizra_db on MySQL at ${MYSQL_HOST}:3306"
  echo "If you imported with mysql-docker-import.sh, use:"
  echo "  export MYSQL_MIGRATION_URL='mysql://root:${MYSQL_PW}@${MYSQL_HOST}:3306/gizra_db'"
  exit 1
fi

exec bash "$ROOT_DIR/scripts/docker-compose.sh" run --rm -T \
  -e DATABASE_URL \
  -e MYSQL_MIGRATION_URL \
  backend \
  node ./node_modules/ts-node/dist/bin.js scripts/migrateMysqlToPostgres.ts "$@"
