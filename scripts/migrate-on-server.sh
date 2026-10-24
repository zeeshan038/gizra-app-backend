#!/usr/bin/env bash
# Run MySQL → Postgres migration ON the Hetzner VPS (no Mac SSH tunnels).
#
# Uses `docker compose run` (same as clear-transactions-server.sh):
#   Postgres → postgres:5432 inside compose network
#   MySQL on host → 172.17.0.1:3306 (docker0 gateway) unless MYSQL_MIGRATION_URL is set
#
#   cd ~/gizra-app-backend && git pull && npm run deploy:server
#   ./scripts/mysql-docker-import.sh /root/gizra_mysql_prod.sql   # if no MySQL on VPS
#   export MYSQL_MIGRATION_URL='mysql://root:migrate_local_root@172.17.0.1:3306/gizra_db'
#   ./scripts/migrate-on-server.sh
#   ./scripts/migrate-on-server.sh --apply --truncate --confirm
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

chmod +x "$ROOT_DIR/scripts/read-db-password-from-env.sh" "$ROOT_DIR/scripts/docker-compose.sh"
node scripts/prepare-compose-env.js

COMPOSE_ENV="$ROOT_DIR/.env.compose"
if [[ ! -f "$COMPOSE_ENV" ]]; then
  echo "Missing .env.compose — run: node scripts/prepare-compose-env.js"
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$COMPOSE_ENV"
set +a

export DATABASE_URL="${GIZRA_DATABASE_URL_INTERNAL:?GIZRA_DATABASE_URL_INTERNAL missing in .env.compose}"

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
