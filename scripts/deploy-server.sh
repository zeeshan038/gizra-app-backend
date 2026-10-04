#!/usr/bin/env bash
# Production deploy: git pull (optional), docker compose up --build, verify. Same pattern as other apps — DATABASE_URL in .env.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]] || ! grep -qE '^DATABASE_URL=' .env; then
  echo "Missing DATABASE_URL in .env — copy env.server.example and set the URL once."
  exit 1
fi

if grep -qE '^DATABASE_URL=.*(127\.0\.0\.1|localhost)' .env; then
  echo "Fix .env: on the server, DATABASE_URL must not use localhost (use server IP:5434 or postgres:5432)."
  exit 1
fi

# Shell exports override compose .env and cause drift — clear before up
unset DATABASE_URL POSTGRES_PASSWORD

if [[ "${1:-}" == "--pull" ]]; then
  git pull "${@:2}"
fi

chmod +x scripts/verify-db-docker.sh scripts/ensure-postgres-password.sh scripts/read-db-password-from-env.sh scripts/docker-compose.sh scripts/ensure-postgres-docker-trust.sh scripts/ensure-postgres-login.sh
node scripts/prepare-compose-env.js

echo "Starting Postgres…"
./scripts/docker-compose.sh up -d postgres

echo "Postgres LOGIN + password (fixes NOLOGIN)…"
./scripts/ensure-postgres-login.sh

echo "Docker internal pg_hba trust (backend auth)…"
./scripts/ensure-postgres-docker-trust.sh

echo "TCP password check for Mac/host :5434…"
./scripts/ensure-postgres-password.sh

./scripts/docker-compose.sh up -d --build --force-recreate backend

echo "Waiting for API…"
for i in $(seq 1 45); do
  if docker logs gizra-backend 2>&1 | tail -25 | grep -q 'Server is running on port'; then
    break
  fi
  if docker logs gizra-backend 2>&1 | tail -12 | grep -qE 'FATAL:|P1000|Authentication failed'; then
    docker logs --tail=30 gizra-backend
    exit 1
  fi
  sleep 2
done

for attempt in 1 2 3 4 5; do
  if ./scripts/verify-db-docker.sh; then
    echo "Deploy OK."
    echo "  curl -s https://backend-prod.gizra.app/api/health/db"
    echo "  curl -sI https://backend-prod.gizra.app/swagger/ | head -1"
    exit 0
  fi
  echo "Verify attempt $attempt failed; retry in 5s…"
  sleep 5
done

docker logs --tail=40 gizra-backend
exit 1
