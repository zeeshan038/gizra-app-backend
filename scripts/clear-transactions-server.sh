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
exec docker compose exec -T backend npx ts-node scripts/clearTransactionalData.ts "$@"
