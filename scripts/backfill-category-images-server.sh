#!/usr/bin/env bash
# Backfill AI category images on production (same DB + R2 env as the API).
#
# Run ON THE HETZNER SERVER after deploy (script must exist in the repo):
#
#   cd ~/gizra-app-backend
#   ./scripts/backfill-category-images-server.sh              # dry run
#   ./scripts/backfill-category-images-server.sh --apply      # write to prod DB
#   ./scripts/backfill-category-images-server.sh --apply --delay-ms=3500
#
# Uses a one-off backend container (postgres:5432). Do not use Mac localhost .env on the host.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
COMPOSE=(bash "$ROOT/scripts/docker-compose.sh")

if ! docker ps --format '{{.Names}}' | grep -qx 'gizra-postgres'; then
  echo "gizra-postgres is not running. Run: npm run deploy:server"
  exit 1
fi

exec "${COMPOSE[@]}" run --rm -T backend \
  node ./node_modules/ts-node/dist/bin.js scripts/backfillCategoryImages.ts "$@"
