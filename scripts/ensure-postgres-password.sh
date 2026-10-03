#!/usr/bin/env bash
# Align Postgres role with password in DATABASE_URL (.env). Used by repair/sync, not normal deploy.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
ENV_FILE="${ENV_FILE:-.env}"
CONTAINER="${POSTGRES_CONTAINER:-gizra-postgres}"

chmod +x "$ROOT_DIR/scripts/read-db-password-from-env.sh"
PW="$(./scripts/read-db-password-from-env.sh "$ENV_FILE")"

docker compose up -d postgres
for i in $(seq 1 30); do
  docker exec "$CONTAINER" pg_isready -U postgres -d gizra_db >/dev/null 2>&1 && break
  [[ "$i" -eq 30 ]] && exit 1
  sleep 1
done

SQL_PASS="${PW//\'/\'\'}"
docker exec -u postgres "$CONTAINER" psql -d postgres -v ON_ERROR_STOP=1 \
  -c "ALTER ROLE postgres WITH LOGIN SUPERUSER PASSWORD '${SQL_PASS}';"

NET="$(docker inspect "$CONTAINER" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' | head -1)"
if [[ -n "$NET" ]]; then
  docker run --rm --network "$NET" -e PGPASSWORD="$PW" postgres:16-alpine \
    psql -h postgres -U postgres -d gizra_db -v ON_ERROR_STOP=1 -c 'SELECT 1;' >/dev/null
  echo "TCP password check OK."
fi
