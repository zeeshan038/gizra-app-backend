#!/usr/bin/env bash
# Run MySQL → Postgres migration ON the Hetzner VPS (no Mac SSH tunnels).
#
# Prerequisites:
#   - MySQL gizra_db reachable at MYSQL_MIGRATION_URL (default root@127.0.0.1:3306/gizra_db)
#   - Postgres Docker on 127.0.0.1:5434
#
# On server:
#   cd ~/gizra-app-backend && git pull
#   chmod +x scripts/migrate-on-server.sh scripts/read-db-password-from-env.sh
#   ./scripts/migrate-on-server.sh
#   ./scripts/migrate-on-server.sh --apply --truncate --confirm
#   npm run db:migrate-reset-sequences   # if node_modules on host
#   docker exec gizra-backend npx ts-node scripts/backfillCloudflareIds.ts
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

chmod +x "$ROOT_DIR/scripts/read-db-password-from-env.sh"
PW="$("$ROOT_DIR/scripts/read-db-password-from-env.sh" "$ROOT_DIR/.env")"

export DATABASE_URL="postgresql://postgres:${PW}@127.0.0.1:5434/gizra_db?schema=public"
export MYSQL_MIGRATION_URL="${MYSQL_MIGRATION_URL:-mysql://root@127.0.0.1:3306/gizra_db}"

echo "DATABASE_URL → 127.0.0.1:5434/gizra_db"
echo "MYSQL_MIGRATION_URL → ${MYSQL_MIGRATION_URL}"

run_ts() {
  node ./node_modules/ts-node/dist/bin.js "$ROOT_DIR/scripts/migrateMysqlToPostgres.ts" "$@"
}

if [[ -f "$ROOT_DIR/node_modules/ts-node/package.json" ]] && command -v node >/dev/null 2>&1; then
  run_ts "$@"
else
  echo "No local node_modules — using Docker (host network)…"
  docker run --rm --network host \
    -v "${ROOT_DIR}:/app" -w /app \
    -e DATABASE_URL -e MYSQL_MIGRATION_URL \
    node:20-bookworm-slim \
    bash -lc "npm ci && npx ts-node scripts/migrateMysqlToPostgres.ts $(printf '%q ' "$@")"
fi
