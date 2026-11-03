#!/usr/bin/env bash
# Normalize legacy absolute variation prices → additive up-charges (same DB as API).
#
# Run ON THE SERVER from the repo root (host has no node_modules; uses backend image):
#
#   cd ~/gizra-dev              # or ~/gizra-app-backend for prod
#   ./scripts/backfill-variation-additive-server.sh           # dry run
#   ./scripts/backfill-variation-additive-server.sh --apply   # write DB
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if docker ps --format '{{.Names}}' | grep -qx 'gizra-dev-postgres'; then
  node scripts/prepare-compose-env.js
  COMPOSE=(docker compose --env-file .env --env-file .env.compose -f docker-compose.dev.yml)
elif docker ps --format '{{.Names}}' | grep -qx 'gizra-postgres'; then
  COMPOSE=(bash "$ROOT/scripts/docker-compose.sh")
else
  echo "No gizra postgres container running (expected gizra-dev-postgres or gizra-postgres)."
  echo "Run: npm run deploy:dev   or   npm run deploy:server"
  exit 1
fi

exec "${COMPOSE[@]}" run --rm -T backend \
  node ./node_modules/ts-node/dist/bin.js scripts/backfillVariationPricesToAdditive.ts "$@"
