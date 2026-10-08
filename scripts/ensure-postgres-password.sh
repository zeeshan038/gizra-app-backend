#!/usr/bin/env bash
# Align Postgres role with password in DATABASE_URL (.env). Used by repair/sync, not normal deploy.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
ENV_FILE="${ENV_FILE:-.env}"
CONTAINER="${POSTGRES_CONTAINER:-gizra-postgres}"

chmod +x "$ROOT_DIR/scripts/read-db-password-from-env.sh"
PW="$(./scripts/read-db-password-from-env.sh "$ENV_FILE")"

chmod +x "$ROOT_DIR/scripts/docker-compose.sh" 2>/dev/null || true
if [[ -x "$ROOT_DIR/scripts/docker-compose.sh" ]]; then
  node "$ROOT_DIR/scripts/prepare-compose-env.js"
  "$ROOT_DIR/scripts/docker-compose.sh" up -d postgres
else
  docker compose up -d postgres
fi
for i in $(seq 1 60); do
  docker exec "$CONTAINER" pg_isready -U postgres -d gizra_db >/dev/null 2>&1 && break
  [[ "$i" -eq 60 ]] && exit 1
  sleep 2
done
sleep 3

SQL_PASS="${PW//\'/\'\'}"
PGDATA="${PGDATA:-/var/lib/postgresql/data}"

apply_role_password() {
  docker exec -u postgres "$CONTAINER" psql -d postgres -v ON_ERROR_STOP=1 \
    -c "ALTER ROLE postgres WITH LOGIN SUPERUSER PASSWORD '${SQL_PASS}';"
}

if ! apply_role_password 2>/dev/null; then
  echo "Peer psql failed (often NOLOGIN from old repair scripts) — fixing via single-user mode…"
  printf '%s\n' "ALTER ROLE postgres WITH LOGIN SUPERUSER PASSWORD '${SQL_PASS}';" \
    | docker exec -i -u postgres "$CONTAINER" postgres --single -D "$PGDATA" template1 >/dev/null
  apply_role_password
fi
echo "OK: postgres role LOGIN + password synced from .env"

NET="$(docker inspect "$CONTAINER" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' | head -1)"
if [[ -n "$NET" ]]; then
  for i in $(seq 1 15); do
    if docker run --rm --network "$NET" -e PGPASSWORD="$PW" postgres:16-alpine \
      psql -h postgres -U postgres -d gizra_db -v ON_ERROR_STOP=1 -c 'SELECT 1;' >/dev/null 2>&1; then
      echo "TCP password check OK."
      exit 0
    fi
    sleep 2
  done
  echo "FAIL: TCP password check to postgres:5432 (Postgres may still be restarting after pg_hba reload)."
  exit 1
fi
