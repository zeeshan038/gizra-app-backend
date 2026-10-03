#!/usr/bin/env bash
# Emergency: postgres NOLOGIN, P1000, or /api/health/db unavailable.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
ENV_FILE="${ENV_FILE:-.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  exit 1
fi

if ! grep -qE '^DATABASE_URL=' "$ENV_FILE"; then
  echo "Set DATABASE_URL in $ENV_FILE first (see env.server.example)."
  exit 1
fi

chmod +x scripts/read-db-password-from-env.sh scripts/postgres-set-password.sh scripts/verify-db-docker.sh
chmod +x scripts/ensure-postgres-docker-trust.sh scripts/ensure-postgres-login.sh scripts/docker-compose.sh

if grep -qE '^REDIS_URL=.*(localhost|127\.0\.0\.1)' "$ENV_FILE"; then
  sed -i 's|^REDIS_URL=.*|REDIS_URL=redis://redis:6379|' "$ENV_FILE"
fi

unset DATABASE_URL POSTGRES_PASSWORD
node scripts/prepare-compose-env.js
./scripts/docker-compose.sh up -d postgres

echo "Step 1/3: postgres LOGIN + password…"
./scripts/ensure-postgres-login.sh

echo "Step 2/3: Docker internal pg_hba trust…"
./scripts/ensure-postgres-docker-trust.sh

echo "Step 3/3: rebuild backend…"
node scripts/prepare-compose-env.js
./scripts/docker-compose.sh up -d --build --force-recreate backend

for i in $(seq 1 30); do
  if docker logs --tail=30 gizra-backend 2>&1 | grep -q 'Connected to PostgreSQL Database via Prisma'; then
    break
  fi
  sleep 2
done
./scripts/verify-db-docker.sh
echo "Done. curl -s https://backend-prod.gizra.app/api/health/db"
