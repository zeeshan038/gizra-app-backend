#!/usr/bin/env bash
# Idempotent SQL patches when Prisma schema is ahead of prod DB (e.g. is_notification_on).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
CONTAINER="${POSTGRES_CONTAINER:-gizra-postgres}"
ENV_FILE="${ENV_FILE:-.env}"
SQL_DIR="${ROOT_DIR}/scripts/sql"

chmod +x "$ROOT_DIR/scripts/read-db-password-from-env.sh"
PW="$(./scripts/read-db-password-from-env.sh "$ENV_FILE")"

shopt -s nullglob
PATCH_FILES=("$SQL_DIR"/*.sql)
shopt -u nullglob
if [[ ${#PATCH_FILES[@]} -eq 0 ]]; then
  echo "No schema patch files in $SQL_DIR"
  exit 0
fi

NET="$(docker inspect "$CONTAINER" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' | head -1)"
if [[ -z "$NET" ]]; then
  echo "FAIL: no Docker network for $CONTAINER"
  exit 1
fi

for SQL in "${PATCH_FILES[@]}"; do
  echo "Applying schema patches from $(basename "$SQL")…"
  docker run --rm --network "$NET" -e PGPASSWORD="$PW" \
    -v "${SQL}:/patch.sql:ro" \
    postgres:16-alpine \
    psql -h postgres -U postgres -d gizra_db -v ON_ERROR_STOP=1 -f /patch.sql
done

echo "OK: schema patches applied"
