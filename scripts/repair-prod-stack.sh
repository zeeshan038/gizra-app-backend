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
./scripts/postgres-set-password.sh "$PW"

echo "Recreating backend so DATABASE_URL matches Postgres (required after any password change)…"
unset DATABASE_URL
export POSTGRES_PASSWORD="$PW"
docker compose up -d --force-recreate backend
sleep 3
./scripts/verify-db-docker.sh

echo "Done. Retry login in the app."
