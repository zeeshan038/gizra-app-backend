#!/usr/bin/env bash
# Fix NOLOGIN / wrong password before pg_hba trust or API deploy.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
ENV_FILE="${ENV_FILE:-.env}"
CONTAINER="${POSTGRES_CONTAINER:-gizra-postgres}"

chmod +x "$ROOT_DIR/scripts/read-db-password-from-env.sh" "$ROOT_DIR/scripts/postgres-set-password.sh"
PW="$(./scripts/read-db-password-from-env.sh "$ENV_FILE")"
SQL_PASS="${PW//\'/\'\'}"

for i in $(seq 1 30); do
  docker exec "$CONTAINER" pg_isready -U postgres -d gizra_db >/dev/null 2>&1 && break
  [[ "$i" -eq 30 ]] && exit 1
  sleep 1
done

if docker exec -u postgres "$CONTAINER" psql -d postgres -v ON_ERROR_STOP=1 \
  -c "ALTER ROLE postgres WITH LOGIN SUPERUSER PASSWORD '${SQL_PASS}';" 2>/dev/null; then
  echo "OK: postgres role LOGIN + password (normal psql)."
  exit 0
fi

echo "postgres role not usable via psql (NOLOGIN/wrong password) — single-user repair…"
GIZRA_SKIP_BACKEND_START=1 ./scripts/postgres-set-password.sh "$PW"
echo "OK: postgres role repaired (single-user)."
