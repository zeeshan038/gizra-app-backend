#!/usr/bin/env bash
# Idempotent SQL patches when Prisma schema is ahead of prod DB (e.g. is_notification_on).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
CONTAINER="${POSTGRES_CONTAINER:-gizra-postgres}"
ENV_FILE="${ENV_FILE:-.env}"
SQL="${ROOT_DIR}/scripts/sql/add-is-notification-on.sql"

chmod +x "$ROOT_DIR/scripts/read-db-password-from-env.sh"
PW="$(./scripts/read-db-password-from-env.sh "$ENV_FILE")"

if [[ ! -f "$SQL" ]]; then
  echo "No schema patch file: $SQL"
  exit 0
fi

NET="$(docker inspect "$CONTAINER" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' | head -1)"
if [[ -z "$NET" ]]; then
  echo "FAIL: no Docker network for $CONTAINER"
  exit 1
fi

echo "Applying schema patches from $(basename "$SQL")…"
docker run --rm --network "$NET" -e PGPASSWORD="$PW" \
  -v "${SQL}:/patch.sql:ro" \
  postgres:16-alpine \
  psql -h postgres -U postgres -d gizra_db -v ON_ERROR_STOP=1 -f /patch.sql

echo "OK: schema patches applied"
