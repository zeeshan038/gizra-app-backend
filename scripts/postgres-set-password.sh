#!/usr/bin/env bash
# Set postgres role password inside gizra-postgres (run on server in compose dir).
# Fixes wrong password (P1000) and "role postgres is not permitted to log in" (NOLOGIN).
set -euo pipefail

NEW_PASS="${1:-}"
CONTAINER="${POSTGRES_CONTAINER:-gizra-postgres}"
PGDATA="${PGDATA:-/var/lib/postgresql/data}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE="${COMPOSE:-$ROOT/scripts/docker-compose.sh}"

if [[ -z "$NEW_PASS" ]]; then
  echo "Usage: ./scripts/postgres-set-password.sh 'YourDbPassword'"
  exit 1
fi

SQL_PASS="${NEW_PASS//\'/\'\'}"
ALTER_SQL="ALTER ROLE postgres WITH LOGIN SUPERUSER PASSWORD '${SQL_PASS}';"

run_single_user() {
  echo "Stopping postgres (single-user needs exclusive access to data dir)..."
  $COMPOSE stop backend postgres 2>/dev/null || true
  docker stop "$CONTAINER" 2>/dev/null || true

  echo "Running single-user repair as OS user postgres (not root)..."
  printf '%s\n' "$ALTER_SQL" | $COMPOSE run --rm --no-deps --user postgres \
    --entrypoint postgres postgres \
    --single -D "$PGDATA" template1

  echo "Starting postgres and backend..."
  $COMPOSE up -d postgres
  sleep 2
  $COMPOSE up -d backend
}

if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Trying normal psql..."
  if docker exec "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "$ALTER_SQL" 2>/dev/null; then
    echo "Password updated (normal psql)."
    exit 0
  fi
  echo "Normal psql failed (wrong password and/or NOLOGIN)."
  run_single_user
  echo "Password updated (single-user mode)."
  exit 0
fi

echo "Postgres container not running — single-user repair..."
run_single_user
echo "Password updated (single-user mode)."
