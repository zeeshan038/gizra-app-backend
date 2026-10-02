#!/usr/bin/env bash
# Align the live Postgres role with POSTGRES_PASSWORD in .env (fixes P1000 / login 503).
# Run on the server from the gizra-backend / gizra-app-backend folder as root.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
ENV_FILE="${ENV_FILE:-.env}"
CONTAINER="${POSTGRES_CONTAINER:-gizra-postgres}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  exit 1
fi

# Load POSTGRES_PASSWORD only (avoid sourcing multiline JSON from .env)
POSTGRES_PASSWORD="$(
  grep -E '^POSTGRES_PASSWORD=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '\r"' | sed "s/^'//;s/'$//"
)"

if [[ -z "$POSTGRES_PASSWORD" ]]; then
  echo "Set POSTGRES_PASSWORD=... in $ENV_FILE (must match what you want the DB to use)."
  exit 1
fi

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "Start Postgres first: docker compose up -d postgres"
  exit 1
fi

echo "Waiting for Postgres to accept connections…"
for i in $(seq 1 30); do
  if docker exec "$CONTAINER" pg_isready -U postgres -d gizra_db >/dev/null 2>&1; then
    break
  fi
  if [[ "$i" -eq 30 ]]; then
    echo "Postgres not ready after 30 attempts. Check: docker logs $CONTAINER"
    exit 1
  fi
  sleep 2
done

echo "Syncing postgres role password (peer auth inside container)…"

# -u postgres → local socket peer auth (works even when password auth is broken)
if ! docker exec -u postgres "$CONTAINER" psql -d postgres -v ON_ERROR_STOP=1 <<SQL
ALTER ROLE postgres WITH LOGIN SUPERUSER PASSWORD '${POSTGRES_PASSWORD//\'/\'\'}';
SQL
then
  echo
  echo "Peer sync failed (often: role postgres NOLOGIN or wrong password)."
  echo "Running single-user repair via scripts/postgres-set-password.sh …"
  chmod +x "$ROOT_DIR/scripts/postgres-set-password.sh"
  "$ROOT_DIR/scripts/postgres-set-password.sh" "$POSTGRES_PASSWORD"
fi

echo "Recreating API container with compose-built DATABASE_URL…"
docker compose up -d --force-recreate backend

sleep 2
if docker logs --tail=25 gizra-backend 2>&1 | grep -q 'Connected to PostgreSQL Database via Prisma'; then
  echo "OK: backend connected to Postgres."
else
  echo "Backend logs (check for P1000):"
  docker logs --tail=25 gizra-backend || true
  exit 1
fi
