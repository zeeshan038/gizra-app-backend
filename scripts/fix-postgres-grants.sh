#!/usr/bin/env bash
# Fixes "User postgres was denied access on the database gizra_db.public" (PG15+ / volume ACL).
# Uses TCP + password (peer psql fails when role postgres has NOLOGIN).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
CONTAINER="${POSTGRES_CONTAINER:-gizra-postgres}"
DB="${POSTGRES_DB:-gizra_db}"
ENV_FILE="${ENV_FILE:-.env}"

chmod +x "$ROOT_DIR/scripts/read-db-password-from-env.sh"
PW="$(./scripts/read-db-password-from-env.sh "$ENV_FILE")"

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "Postgres container not running: $CONTAINER"
  exit 1
fi

NET="$(docker inspect "$CONTAINER" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' | head -1)"
if [[ -z "$NET" ]]; then
  echo "FAIL: could not detect Docker network for $CONTAINER"
  exit 1
fi

psql_tcp() {
  docker run --rm --network "$NET" -e PGPASSWORD="$PW" postgres:16-alpine \
    psql -h postgres -U postgres "$@"
}

echo "Repairing Postgres grants on database ${DB} (TCP)…"

if ! psql_tcp -d postgres -v ON_ERROR_STOP=1 -c "SELECT 1;" >/dev/null 2>&1; then
  echo "FAIL: cannot connect as postgres over TCP (NOLOGIN or wrong password)."
  echo "Run first: ./scripts/ensure-postgres-password.sh"
  exit 1
fi

psql_tcp -d postgres -v ON_ERROR_STOP=1 -c "
  ALTER DATABASE ${DB} OWNER TO postgres;
  GRANT CONNECT, CREATE, TEMPORARY ON DATABASE ${DB} TO postgres;
"

psql_tcp -d "$DB" -v ON_ERROR_STOP=1 <<'SQL'
ALTER SCHEMA public OWNER TO postgres;
GRANT USAGE, CREATE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO public;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
SQL

if ! psql_tcp -d "$DB" -v ON_ERROR_STOP=1 -c "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' LIMIT 1;" >/dev/null; then
  echo "WARN: public schema probe failed"
  exit 1
fi

echo "OK: postgres role can use ${DB}.public"
