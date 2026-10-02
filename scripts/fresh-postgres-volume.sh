#!/usr/bin/env bash
# Deletes the Postgres Docker volume and recreates DB with POSTGRES_PASSWORD from .env.
# ALL DATA IN gizra_db IS LOST. Run from gizra-backend / gizra-app-backend on server or Mac.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "Missing .env — set POSTGRES_PASSWORD=... first."
  exit 1
fi

PW="$(
  grep -E '^POSTGRES_PASSWORD=' .env | head -1 | cut -d= -f2- | tr -d '\r"' | sed "s/^'//;s/'$//"
)"
if [[ -z "$PW" ]]; then
  echo "Set POSTGRES_PASSWORD in .env before running this script."
  exit 1
fi

echo "This will DELETE the Postgres volume (all orders, users, etc.) and recreate empty gizra_db."
echo "Password for the new cluster will be: (from .env POSTGRES_PASSWORD)"
read -r -p "Type DELETE to continue: " confirm
[[ "$confirm" == "DELETE" ]] || { echo "Aborted."; exit 1; }

docker compose down --remove-orphans
VOL="$(docker volume ls -q | grep pgdata | head -1 || true)"
if [[ -n "$VOL" ]]; then
  docker volume rm -f "$VOL"
  echo "Removed volume: $VOL"
fi

export POSTGRES_PASSWORD="$PW"
docker compose up -d postgres redis

echo "Waiting for Postgres..."
for i in $(seq 1 30); do
  docker exec gizra-postgres pg_isready -U postgres -d gizra_db >/dev/null 2>&1 && break
  [[ "$i" -eq 30 ]] && { echo "Postgres failed to start"; exit 1; }
  sleep 2
done

docker compose up -d --build backend
sleep 3
docker logs --tail=20 gizra-backend

echo
echo "Fresh Postgres is up. Run migrations/seed if your project requires them."
