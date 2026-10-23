#!/usr/bin/env bash
# Run DB clear ON THE HETZNER SERVER (inside the backend container — has Node + DATABASE_URL).
#
#   cd ~/gizra-app-backend
#   ./scripts/clear-transactions-server.sh           # dry run
#   ./scripts/clear-transactions-server.sh --apply
#
# Do NOT run mac-db-tunnel.sh on the server. Postgres is already on 127.0.0.1:5434 via Docker.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
COMPOSE=(bash "$ROOT/scripts/docker-compose.sh")

if ! "${COMPOSE[@]}" ps --status running backend 2>/dev/null | grep -q backend; then
  echo "gizra-backend container is not running. Start stack: npm run deploy:server"
  exit 1
fi
exec "${COMPOSE[@]}" exec -T backend node ./node_modules/ts-node/dist/bin.js scripts/clearTransactionalData.ts "$@"
