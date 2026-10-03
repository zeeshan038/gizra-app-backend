#!/usr/bin/env bash
# Fast path: Postgres up but API lost DB pool → restart backend only.
set -euo pipefail
cd "$(dirname "$0")/.."
unset DATABASE_URL POSTGRES_PASSWORD
HEALTH="${HEALTH_URL:-http://127.0.0.1:3002/api/health/db}"

if curl -sf --max-time 8 "$HEALTH" 2>/dev/null | grep -q '"db":"ok"'; then
  echo "Already ok."
  exit 0
fi

if ! docker exec gizra-postgres pg_isready -U postgres -d gizra_db >/dev/null 2>&1; then
  echo "Postgres not ready — need full repair."
  exit 1
fi

echo "Postgres ready — restarting backend…"
node scripts/prepare-compose-env.js 2>/dev/null || true
docker restart gizra-backend
for i in $(seq 1 30); do
  if curl -sf --max-time 5 "$HEALTH" 2>/dev/null | grep -q '"db":"ok"'; then
    echo "OK after backend restart."
    exit 0
  fi
  sleep 2
done
echo "Still unhealthy after restart."
exit 1
