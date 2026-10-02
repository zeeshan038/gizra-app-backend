#!/usr/bin/env bash
# One-time / after fresh Postgres volume: validate env, start stack, apply Prisma schema, verify DB.
# Run on Hetzner as root from ~/gizra-app-backend
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "Missing .env — copy from .env.example and set secrets."
  exit 1
fi

PW="$(
  grep -E '^POSTGRES_PASSWORD=' .env | head -1 | cut -d= -f2- | tr -d '\r"' | sed "s/^'//;s/'$//"
)"
if [[ -z "$PW" ]]; then
  echo "Add POSTGRES_PASSWORD=your_password to .env (required)."
  exit 1
fi

if grep -qE '^DATABASE_URL=' .env; then
  echo "WARN: Remove DATABASE_URL from server .env — Compose builds it from POSTGRES_PASSWORD."
  echo "      Keeping it can confuse debugging; API container always uses Compose DATABASE_URL."
fi

export POSTGRES_PASSWORD="$PW"

chmod +x scripts/sync-database-url-env.sh
./scripts/sync-database-url-env.sh

echo "=== Starting stack ==="
docker compose up -d --build

echo "=== Waiting for Postgres ==="
for i in $(seq 1 30); do
  docker exec gizra-postgres pg_isready -U postgres -d gizra_db >/dev/null 2>&1 && break
  [[ "$i" -eq 30 ]] && { echo "Postgres not ready"; exit 1; }
  sleep 2
done

echo "=== Applying Prisma schema to empty gizra_db ==="
docker exec gizra-backend npx prisma db push --accept-data-loss

echo "=== PostGIS (zones) ==="
docker exec gizra-backend npm run enable-postgis || true

echo "=== Verification ==="
chmod +x scripts/verify-db-docker.sh
./scripts/verify-db-docker.sh

echo
echo "=== Backend logs (last lines) ==="
docker logs --tail=12 gizra-backend

echo
echo "Done. Test: curl -sI https://backend-prod.gizra.app/swagger/ | head -1"
echo "Register/login users via API or: npm run create-admin (inside backend container if configured)."
