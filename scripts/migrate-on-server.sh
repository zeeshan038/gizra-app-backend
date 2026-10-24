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

export DATABASE_URL="$("$ROOT_DIR/scripts/read-compose-internal-db-url.sh")"

MYSQL_HOST="${GIZRA_MYSQL_HOST:-172.17.0.1}"
export MYSQL_MIGRATION_URL="${MYSQL_MIGRATION_URL:-mysql://root@${MYSQL_HOST}:3306/gizra_db}"

echo "DATABASE_URL → postgres:5432/gizra_db (compose network)"
echo "MYSQL_MIGRATION_URL → ${MYSQL_MIGRATION_URL}"

if ! docker ps --format '{{.Names}}' | grep -qx 'gizra-postgres'; then
  echo "gizra-postgres is not running. Run: npm run deploy:server"
  exit 1
fi

exec bash "$ROOT_DIR/scripts/docker-compose.sh" run --rm -T \
  -e DATABASE_URL \
  -e MYSQL_MIGRATION_URL \
  backend \
  node ./node_modules/ts-node/dist/bin.js scripts/migrateMysqlToPostgres.ts "$@"
