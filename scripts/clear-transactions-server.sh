#!/usr/bin/env bash
# Run DB clear ON THE HETZNER SERVER (one-off backend container — same DB as prod API).
#
#   cd ~/gizra-app-backend
#   ./scripts/clear-transactions-server.sh           # dry run
#   ./scripts/clear-transactions-server.sh --apply
#
# Do NOT run mac-db-tunnel.sh on the server. Do NOT use npm run db:clear-transactions on the
# host unless DATABASE_URL in .env is 127.0.0.1:5434 and Postgres is up (prefer this script).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
COMPOSE=(bash "$ROOT/scripts/docker-compose.sh")

if ! docker ps --format '{{.Names}}' | grep -qx 'gizra-postgres'; then
  echo "gizra-postgres is not running. Run: npm run deploy:server"
  exit 1
fi

# `run --rm` works even when gizra-backend is stopped; uses postgres:5432 from compose env.
exec "${COMPOSE[@]}" run --rm -T backend \
  node ./node_modules/ts-node/dist/bin.js scripts/clearTransactionalData.ts "$@"
