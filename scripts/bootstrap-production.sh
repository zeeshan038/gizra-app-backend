#!/usr/bin/env bash
# One-time / after fresh Postgres volume: start stack, Prisma migrate, verify.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]] || ! grep -qE '^DATABASE_URL=' .env; then
  echo "Missing DATABASE_URL in .env — copy env.server.example"
  exit 1
fi

unset DATABASE_URL POSTGRES_PASSWORD

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
