#!/usr/bin/env bash
# When health/db is red: quick backend restart, then full deploy (never trust/single-user loops).
set -euo pipefail
cd "$(dirname "$0")/.."
unset DATABASE_URL POSTGRES_PASSWORD
git pull origin zeeshan-dev 2>/dev/null || true
chmod +x scripts/prod-quick-heal.sh scripts/deploy-server.sh
if ./scripts/prod-quick-heal.sh; then
  exit 0
fi
exec ./scripts/deploy-server.sh
