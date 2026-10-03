#!/usr/bin/env bash
# One command after P1000 / password drift: align Postgres, fix .env, recreate API, verify.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
ENV_FILE="${ENV_FILE:-.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  exit 1
fi

PW="$(
  grep -E '^POSTGRES_PASSWORD=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '\r"' | sed "s/^'//;s/'$//"
)"
if [[ -z "$PW" ]]; then
  echo "Set POSTGRES_PASSWORD=... in $ENV_FILE"
  exit 1
fi

# Mac .env copies break Docker
if grep -qE '^DATABASE_URL=' "$ENV_FILE"; then
  echo "Removing DATABASE_URL from $ENV_FILE (entrypoint builds it from POSTGRES_PASSWORD)."
  sed -i '/^DATABASE_URL=/d' "$ENV_FILE"
fi
if grep -qE '^REDIS_URL=.*(localhost|127\.0\.0\.1)' "$ENV_FILE"; then
  echo "Fixing REDIS_URL for Docker."
  if grep -qE '^REDIS_URL=' "$ENV_FILE"; then
    sed -i 's|^REDIS_URL=.*|REDIS_URL=redis://redis:6379|' "$ENV_FILE"
  else
    echo 'REDIS_URL=redis://redis:6379' >> "$ENV_FILE"
  fi
fi

chmod +x scripts/postgres-set-password.sh scripts/verify-db-docker.sh

echo "Checking if Postgres password already matches .env (skip destructive repair when OK)…"
EXPORT_SNIPPET="$(tr '\n' ' ' < "$ROOT_DIR/scripts/docker-export-database-url.sh")"
if docker inspect gizra-backend >/dev/null 2>&1; then
  if docker exec gizra-backend sh -c "$EXPORT_SNIPPET; node -e \"
const { PrismaClient } = require('@prisma/client');
new PrismaClient().\\\$queryRaw\\\`SELECT 1\\\`.then(() => process.exit(0)).catch(() => process.exit(1));
\"" 2>/dev/null; then
    echo "DB auth already OK — skipping postgres-set-password (avoids unnecessary restarts)."
  else
    ./scripts/postgres-set-password.sh "$PW"
  fi
else
  ./scripts/postgres-set-password.sh "$PW"
fi

echo "Rebuilding + recreating backend (entrypoint builds DATABASE_URL from POSTGRES_PASSWORD)…"
unset DATABASE_URL
export POSTGRES_PASSWORD="$PW"
docker compose up -d --build --force-recreate backend
echo "Waiting for API to pass entrypoint and connect to Postgres…"
for i in $(seq 1 30); do
  if docker logs --tail=30 gizra-backend 2>&1 | grep -q 'Connected to PostgreSQL Database via Prisma'; then
    break
  fi
  if docker logs --tail=5 gizra-backend 2>&1 | grep -q 'FATAL:'; then
    echo "Backend failed to start:"
    docker logs --tail=20 gizra-backend || true
    exit 1
  fi
  sleep 2
done
./scripts/verify-db-docker.sh

echo "Done. Retry login in the app."
