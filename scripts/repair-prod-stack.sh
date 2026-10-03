#!/usr/bin/env bash
# Emergency only: DB password in volume ≠ password in DATABASE_URL (P1000 on login).
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

PW="$(./scripts/read-db-password-from-env.sh "$ENV_FILE")"

if grep -qE '^REDIS_URL=.*(localhost|127\.0\.0\.1)' "$ENV_FILE"; then
  sed -i 's|^REDIS_URL=.*|REDIS_URL=redis://redis:6379|' "$ENV_FILE"
fi

echo "Syncing Postgres role to match password in DATABASE_URL…"
if ! docker exec -u postgres gizra-postgres psql -d postgres -v ON_ERROR_STOP=1 \
  -c "ALTER ROLE postgres WITH LOGIN SUPERUSER PASSWORD '${PW//\'/\'\'}';" 2>/dev/null; then
  ./scripts/postgres-set-password.sh "$PW"
fi

unset DATABASE_URL POSTGRES_PASSWORD
docker compose up -d --build --force-recreate backend

for i in $(seq 1 30); do
  if docker logs --tail=30 gizra-backend 2>&1 | grep -q 'Connected to PostgreSQL Database via Prisma'; then
    break
  fi
  sleep 2
done
./scripts/verify-db-docker.sh
echo "Done. Retry login in the app."
