#!/usr/bin/env bash
# Run ON THE SERVER (SSH) in the gizra-backend directory where docker-compose.yml lives.
# Fixes P1000 "Authentication failed" when DATABASE_URL password ≠ Postgres volume password.
set -euo pipefail

NEW_PASS="${1:-}"
if [[ -z "$NEW_PASS" ]]; then
  echo "Usage: ./scripts/fix-server-db-auth.sh 'YourNewDbPassword'"
  echo "Pick one password, apply it to Postgres, then write the same value into .env DATABASE_URL."
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx 'gizra-postgres'; then
  echo "gizra-postgres container not running. Start stack: docker compose up -d"
  exit 1
fi

echo "Setting postgres user password inside gizra-postgres..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$SCRIPT_DIR/postgres-set-password.sh" "$NEW_PASS"

ENV_FILE=".env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing .env — create it from .env.example"
  exit 1
fi

# Docker backend must use service hostname postgres:5432
NEW_URL="postgresql://postgres:${NEW_PASS}@postgres:5432/gizra_db?schema=public"
if grep -q '^DATABASE_URL=' "$ENV_FILE"; then
  if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=\"${NEW_URL}\"|" "$ENV_FILE"
  else
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"${NEW_URL}\"|" "$ENV_FILE"
  fi
else
  echo "DATABASE_URL=\"${NEW_URL}\"" >> "$ENV_FILE"
fi

if grep -q '^POSTGRES_PASSWORD=' "$ENV_FILE"; then
  if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${NEW_PASS}|" "$ENV_FILE"
  else
    sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${NEW_PASS}|" "$ENV_FILE"
  fi
else
  echo "POSTGRES_PASSWORD=${NEW_PASS}" >> "$ENV_FILE"
fi

echo "Recreating backend container..."
docker compose up -d --force-recreate backend

echo "Waiting for API..."
sleep 3
curl -sf "http://127.0.0.1:3002/api/health" && echo "" || echo "Health check failed — docker logs gizra-backend"

echo "Done. DATABASE_URL now uses postgres:5432 inside Docker."
