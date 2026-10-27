#!/usr/bin/env bash
# Clones production database from gizra-postgres into gizra-dev-postgres
set -euo pipefail

PROD_CONTAINER="${PROD_CONTAINER:-gizra-postgres}"
DEV_CONTAINER="${DEV_CONTAINER:-gizra-dev-postgres}"
DB_NAME="${DB_NAME:-gizra_db}"
DUMP_FILE="/tmp/gizra_prod_snapshot_$(date +%Y%m%d_%H%M%S).dump"

echo "=== Cloning Prod Database to Dev Database ==="

if ! docker ps --format '{{.Names}}' | grep -q "^${PROD_CONTAINER}$"; then
  echo "FAIL: Production container '$PROD_CONTAINER' is not running!"
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -q "^${DEV_CONTAINER}$"; then
  echo "FAIL: Dev container '$DEV_CONTAINER' is not running!"
  echo "Please start dev Postgres first: docker compose -f docker-compose.dev.yml up -d postgres"
  exit 1
fi

echo "1. Exporting prod database from $PROD_CONTAINER..."
docker exec "$PROD_CONTAINER" pg_dump -U postgres -Fc "$DB_NAME" > "$DUMP_FILE"
echo "Dump saved to $DUMP_FILE ($(du -h "$DUMP_FILE" | cut -f1))"

echo "2. Preparing dev database in $DEV_CONTAINER..."
# Terminate existing connections to dev db if any
docker exec -u postgres "$DEV_CONTAINER" psql -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true

docker exec -u postgres "$DEV_CONTAINER" psql -d postgres -c "DROP DATABASE IF EXISTS ${DB_NAME};"
docker exec -u postgres "$DEV_CONTAINER" psql -d postgres -c "CREATE DATABASE ${DB_NAME};"

echo "3. Restoring dump into $DEV_CONTAINER..."
docker exec -i "$DEV_CONTAINER" pg_restore -U postgres -d "$DB_NAME" --no-owner --role=postgres < "$DUMP_FILE" || true

echo "4. Running grant fixes on $DEV_CONTAINER..."
POSTGRES_CONTAINER="$DEV_CONTAINER" ./scripts/fix-postgres-grants.sh || true
POSTGRES_CONTAINER="$DEV_CONTAINER" ./scripts/apply-schema-patches.sh || true

rm -f "$DUMP_FILE"

echo "==========================================="
echo "Prod DB successfully cloned to $DEV_CONTAINER!"
echo "==========================================="
