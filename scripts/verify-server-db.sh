#!/usr/bin/env bash
# Run on the server in the docker-compose directory.
set -euo pipefail

COMPOSE="${COMPOSE:-docker compose}"
ENV_FILE="${ENV_FILE:-.env}"

echo "=== .env DATABASE_URL (password redacted) ==="
if [[ -f "$ENV_FILE" ]]; then
  grep '^DATABASE_URL=' "$ENV_FILE" | sed -E 's/:([^:@]+)@/:***@/'
else
  echo "Missing $ENV_FILE"
fi

echo ""
echo "=== gizra-backend container DATABASE_URL (password redacted) ==="
if docker ps --format '{{.Names}}' | grep -qx gizra-backend; then
  docker exec gizra-backend printenv DATABASE_URL | sed -E 's/:([^:@]+)@/:***@/' || echo "(not set in container)"
else
  echo "gizra-backend not running"
fi

echo ""
echo "=== Password auth test (same as Prisma: TCP + password) ==="
PASS="${1:-}"
if [[ -z "$PASS" ]]; then
  echo "Usage: ./scripts/verify-server-db.sh 'password_from_env'"
  echo "Tests: psql -h 127.0.0.1 inside postgres container"
  exit 1
fi

if docker exec -e PGPASSWORD="$PASS" gizra-postgres \
  psql -U postgres -h 127.0.0.1 -d gizra_db -v ON_ERROR_STOP=1 -c "SELECT 1 AS ok;" 2>&1; then
  echo "TCP password auth: OK"
else
  echo "TCP password auth: FAILED — Postgres password is not this value, or LOGIN disabled."
fi

echo ""
echo "If .env and container URL differ, run: docker compose up -d --force-recreate backend"
