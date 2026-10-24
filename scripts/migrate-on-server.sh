#!/usr/bin/env bash
# Run MySQL → Postgres migration ON the Hetzner VPS (no Mac SSH tunnels).
#
#   cd ~/gizra-app-backend && git pull
#   npm run deploy:server    # rebuild backend image after migration script changes
#   ./scripts/migrate-on-server.sh
#   ./scripts/migrate-on-server.sh --apply --truncate --confirm
#
# MySQL is usually NOT on this VPS — import a dump first:
#   ./scripts/mysql-docker-import.sh /root/gizra_mysql_prod.sql
#   export MYSQL_MIGRATION_URL='mysql://root:migrate_local_root@127.0.0.1:3306/gizra_db'
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

chmod +x "$ROOT_DIR/scripts/read-db-password-from-env.sh" "$ROOT_DIR/scripts/docker-compose.sh"
PW="$("$ROOT_DIR/scripts/read-db-password-from-env.sh" "$ROOT_DIR/.env")"

export DATABASE_URL="postgresql://postgres:${PW}@127.0.0.1:5434/gizra_db?schema=public"
export MYSQL_MIGRATION_URL="${MYSQL_MIGRATION_URL:-mysql://root@127.0.0.1:3306/gizra_db}"

echo "DATABASE_URL → 127.0.0.1:5434/gizra_db"
echo "MYSQL_MIGRATION_URL → ${MYSQL_MIGRATION_URL}"

if ! docker ps --format '{{.Names}}' | grep -qx 'gizra-postgres'; then
  echo "gizra-postgres is not running. Run: npm run deploy:server"
  exit 1
fi

# Host network so 127.0.0.1:5434 (Postgres) and 127.0.0.1:3306 (MySQL / MariaDB import) resolve on the VPS.
node scripts/prepare-compose-env.js 2>/dev/null || true
exec bash "$ROOT_DIR/scripts/docker-compose.sh" run --rm -T --network host \
  -e DATABASE_URL \
  -e MYSQL_MIGRATION_URL \
  backend \
  node ./node_modules/ts-node/dist/bin.js scripts/migrateMysqlToPostgres.ts "$@"
