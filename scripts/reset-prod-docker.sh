#!/usr/bin/env bash
# Nuclear option: wipe Postgres + Redis volumes and redeploy with ONE password from .env.
# Run ON THE SERVER in ~/gizra-app-backend only when you accept DATA LOSS (empty DB after reset).
#
# Usage:
#   cd ~/gizra-app-backend
#   # Ensure .env has the password you want forever:
#   # DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@167.233.245.44:5434/gizra_db?schema=public
#   unset DATABASE_URL POSTGRES_PASSWORD
#   GIZRA_CONFIRM_WIPE=1 ./scripts/reset-prod-docker.sh
#
# After reset: restore from backup or run seeds/migrations as needed.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "${GIZRA_CONFIRM_WIPE:-}" != "1" ]]; then
  echo "This DELETES Docker volumes pgdata + redisdata (all DB + Redis data)."
  echo "Set GIZRA_CONFIRM_WIPE=1 to proceed."
  exit 1
fi

if [[ ! -f .env ]] || ! grep -qE '^DATABASE_URL=' .env; then
  echo "Missing DATABASE_URL in .env — set it once (see env.server.example)."
  exit 1
fi

if grep -qE '^DATABASE_URL=.*(127\.0\.0\.1|localhost)' .env; then
  echo "On the server, DATABASE_URL must use 167.233.245.44:5434 (not localhost)."
  exit 1
fi

unset DATABASE_URL POSTGRES_PASSWORD
chmod +x scripts/docker-compose.sh scripts/deploy-server.sh

echo "Stopping stack…"
./scripts/docker-compose.sh down --remove-orphans 2>/dev/null || docker compose down --remove-orphans

echo "Removing volumes (pgdata, redisdata)…"
docker volume rm gizra-app-backend_pgdata gizra-app-backend_redisdata 2>/dev/null \
  || docker volume rm "$(basename "$ROOT_DIR")_pgdata" "$(basename "$ROOT_DIR")_redisdata" 2>/dev/null \
  || docker volume ls -q | grep -E 'pgdata|redisdata' | xargs -r docker volume rm

node scripts/prepare-compose-env.js
echo "Fresh deploy (Postgres init uses POSTGRES_PASSWORD from .env.compose)…"
npm run deploy:server

echo ""
echo "Done. Verify:"
echo "  curl -s https://backend-prod.gizra.app/api/health/db"
echo "Mac .env must use the SAME password and connect via:"
echo "  ssh -N -L 5434:127.0.0.1:5434 root@167.233.245.44"
echo "  DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@127.0.0.1:5434/gizra_db?schema=public"
