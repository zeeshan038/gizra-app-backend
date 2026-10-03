#!/usr/bin/env bash
# Align live Postgres password with DATABASE_URL in .env (fixes P1000).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
ENV_FILE="${ENV_FILE:-.env}"
CONTAINER="${POSTGRES_CONTAINER:-gizra-postgres}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  exit 1
fi

chmod +x "$ROOT_DIR/scripts/read-db-password-from-env.sh"
POSTGRES_PASSWORD="$(./scripts/read-db-password-from-env.sh "$ENV_FILE")"

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "Start Postgres first: docker compose up -d postgres"
  exit 1
fi

for i in $(seq 1 30); do
  docker exec "$CONTAINER" pg_isready -U postgres -d gizra_db >/dev/null 2>&1 && break
  [[ "$i" -eq 30 ]] && exit 1
  sleep 2
done

if ! docker exec -u postgres "$CONTAINER" psql -d postgres -v ON_ERROR_STOP=1 <<SQL
ALTER ROLE postgres WITH LOGIN SUPERUSER PASSWORD '${POSTGRES_PASSWORD//\'/\'\'}';
SQL
then
  "$ROOT_DIR/scripts/postgres-set-password.sh" "$POSTGRES_PASSWORD"
fi

unset DATABASE_URL POSTGRES_PASSWORD
chmod +x "$ROOT_DIR/scripts/docker-compose.sh"
node "$ROOT_DIR/scripts/prepare-compose-env.js"
"$ROOT_DIR/scripts/docker-compose.sh" up -d --build --force-recreate backend
sleep 3
docker logs --tail=15 gizra-backend
