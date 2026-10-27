#!/usr/bin/env bash
# Dev environment deploy — isolated from prod stack
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

export COMPOSE_FILE="docker-compose.dev.yml"
export POSTGRES_CONTAINER="gizra-dev-postgres"
export BACKEND_CONTAINER="gizra-dev-backend"

if [[ ! -f .env ]] || ! grep -qE '^DATABASE_URL=' .env; then
  echo "Missing DATABASE_URL in .env — copy env.server.example or set the URL."
  exit 1
fi

if grep -qE '^DATABASE_URL=.*(127\.0\.0\.1|localhost)' .env || grep -qE '^REDIS_URL=.*(127\.0\.0\.1|localhost)' .env; then
  echo "Mac-style .env detected (localhost) — rewriting for server (postgres:5432, redis:6379)…"
  node scripts/normalize-server-env.js
fi

unset DATABASE_URL POSTGRES_PASSWORD

if [[ "${1:-}" == "--pull" ]]; then
  git pull "${@:2}"
fi

chmod +x scripts/preflight-server-env.sh scripts/verify-db-docker.sh scripts/ensure-postgres-password.sh scripts/read-db-password-from-env.sh scripts/fix-postgres-grants.sh scripts/apply-schema-patches.sh 2>/dev/null || true

./scripts/preflight-server-env.sh
node scripts/prepare-compose-env.js

if ! grep -qE '^GIZRA_DATABASE_URL_INTERNAL=postgresql://[^:]+:[^@]+@postgres:5432/' .env.compose; then
  echo "FAIL: .env.compose must set postgres:5432 URL with password (run prepare-compose-env.js)."
  exit 1
fi

echo "Starting Dev Postgres + Redis…"
docker compose -f docker-compose.dev.yml up -d postgres redis

echo "Sync Postgres role password with .env for $POSTGRES_CONTAINER…"
./scripts/ensure-postgres-password.sh
echo "Ensure public schema grants for $POSTGRES_CONTAINER…"
./scripts/fix-postgres-grants.sh

echo "Building and starting Dev Backend…"
docker compose -f docker-compose.dev.yml up -d --build --force-recreate --remove-orphans backend

backend_container_id() {
  docker inspect -f '{{.Id}}' "$BACKEND_CONTAINER" 2>/dev/null || true
}

BACKEND_CID="$(backend_container_id)"

echo "Waiting for Dev API (entrypoint DB check + npm start)…"
api_ready=0
for i in $(seq 1 120); do
  CID="${BACKEND_CID:-$(backend_container_id)}"
  if [[ -n "$CID" ]] && docker logs "$CID" 2>&1 | tail -40 | grep -q 'Server is running on port'; then
    api_ready=1
    break
  fi
  if [[ -n "$CID" ]] && docker logs "$CID" 2>&1 | tail -30 | grep -qE 'P1010|denied access on the database'; then
    echo "Detected Prisma P1010 on Dev — repairing…"
    ./scripts/fix-postgres-grants.sh
    docker compose -f docker-compose.dev.yml up -d --force-recreate backend
    BACKEND_CID="$(backend_container_id)"
    sleep 5
  fi
  if [[ -n "$CID" ]] && docker logs "$CID" 2>&1 | tail -20 | grep -qE 'FATAL:|P1000|Authentication failed'; then
    docker logs --tail=40 "$CID"
    echo "Authentication failed in Dev container."
    exit 1
  fi
  sleep 2
done

if [[ "$api_ready" -ne 1 ]]; then
  echo "FAIL: Dev API did not log 'Server is running on port' within ~4 minutes."
  docker logs --tail=50 "$BACKEND_CONTAINER"
  exit 1
fi
sleep 3

for attempt in $(seq 1 24); do
  if ./scripts/verify-db-docker.sh; then
    echo "==========================================="
    echo "Dev Deploy OK!"
    echo "  curl -s http://127.0.0.1:3003/api/health/db"
    echo "  curl -s https://dev-backend.gizra.app/api/health/db"
    echo "==========================================="
    exit 0
  fi
  echo "Verify attempt $attempt failed; retry in 5s…"
  sleep 5
done

docker logs --tail=40 "$BACKEND_CONTAINER"
exit 1
