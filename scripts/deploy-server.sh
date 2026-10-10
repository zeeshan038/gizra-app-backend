#!/usr/bin/env bash
# Production deploy — Raidr-style: one password in .env, compose up, verify. No trust/single-user on routine deploy.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]] || ! grep -qE '^DATABASE_URL=' .env; then
  echo "Missing DATABASE_URL in .env — copy env.server.example and set the URL once."
  exit 1
fi

if grep -qE '^DATABASE_URL=.*(127\.0\.0\.1|localhost)' .env; then
  echo "Fix .env: on the server use postgres:5432 or 167.x:5434 — not localhost."
  exit 1
fi

unset DATABASE_URL POSTGRES_PASSWORD

if [[ "${1:-}" == "--pull" ]]; then
  git pull "${@:2}"
fi

chmod +x scripts/preflight-server-env.sh scripts/verify-db-docker.sh scripts/ensure-postgres-password.sh scripts/read-db-password-from-env.sh scripts/docker-compose.sh
./scripts/preflight-server-env.sh
node scripts/prepare-compose-env.js

if ! grep -qE '^GIZRA_DATABASE_URL_INTERNAL=postgresql://[^:]+:[^@]+@postgres:5432/' .env.compose; then
  echo "FAIL: .env.compose must set postgres:5432 URL with password (run prepare-compose-env.js)."
  exit 1
fi

echo "Starting Postgres + Redis…"
./scripts/docker-compose.sh up -d postgres redis

docker stop gizra-cloudflared 2>/dev/null || true
docker rm gizra-cloudflared 2>/dev/null || true

echo "Sync Postgres role password with .env (for host :5434 + container)…"
chmod +x scripts/fix-postgres-grants.sh scripts/apply-schema-patches.sh 2>/dev/null || true
./scripts/ensure-postgres-password.sh
echo "Ensure public schema grants (fixes Prisma P1010 gizra_db.public)…"
./scripts/fix-postgres-grants.sh

./scripts/docker-compose.sh up -d --build --force-recreate --remove-orphans backend

echo "Waiting for API (entrypoint DB check + npm start can take 2–3 min on small VPS)…"
api_ready=0
for i in $(seq 1 120); do
  if docker logs gizra-backend 2>&1 | tail -40 | grep -q 'Server is running on port'; then
    api_ready=1
    break
  fi
  if docker logs gizra-backend 2>&1 | tail -30 | grep -qE 'P1010|denied access on the database'; then
    echo "Detected Prisma P1010 (Postgres grants) — repairing…"
    ./scripts/fix-postgres-grants.sh
    ./scripts/docker-compose.sh up -d --force-recreate backend
    sleep 5
  fi
  if docker logs gizra-backend 2>&1 | tail -20 | grep -qE 'FATAL:|P1000|Authentication failed'; then
    docker logs --tail=40 gizra-backend
    echo "If this persists once, run: npm run fix:prod-db — then use only deploy:server."
    exit 1
  fi
  sleep 2
done
if [[ "$api_ready" -ne 1 ]]; then
  echo "FAIL: API did not log 'Server is running on port' within ~4 minutes."
  docker logs --tail=50 gizra-backend
  exit 1
fi
sleep 3

for attempt in 1 2 3 4 5; do
  if ./scripts/verify-db-docker.sh; then
    echo "Deploy OK."
    echo "  curl -s http://127.0.0.1:3002/api/health/db"
    echo "  curl -s https://backend-prod.gizra.app/api/health/db"
    exit 0
  fi
  echo "Verify attempt $attempt failed; retry in 5s…"
  sleep 5
done

docker logs --tail=40 gizra-backend
if docker logs gizra-backend 2>&1 | tail -60 | grep -qE 'P1010|denied access on the database'; then
  echo ""
  echo "Fix on server:"
  echo "  cd ~/gizra-app-backend && unset DATABASE_URL POSTGRES_PASSWORD"
  echo "  ./scripts/ensure-postgres-password.sh && ./scripts/fix-postgres-grants.sh"
  echo "  npm run deploy:server"
fi
exit 1
