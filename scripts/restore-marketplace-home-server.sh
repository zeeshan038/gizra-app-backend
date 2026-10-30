#!/usr/bin/env bash
# Restore PHP-style marketplace home categories on production.
#
#   cd ~/gizra-app-backend
#   ./scripts/restore-marketplace-home-server.sh
#   ./scripts/restore-marketplace-home-server.sh --apply
#   ./scripts/restore-marketplace-home-server.sh --apply --generate-images
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
COMPOSE=(bash "$ROOT/scripts/docker-compose.sh")

if ! docker ps --format '{{.Names}}' | grep -qx 'gizra-postgres'; then
  echo "gizra-postgres is not running. Run: npm run deploy:server"
  exit 1
fi

exec "${COMPOSE[@]}" run --rm -T backend \
  node ./node_modules/ts-node/dist/bin.js scripts/restoreMarketplaceHomeCategories.ts "$@"
