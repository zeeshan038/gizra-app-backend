#!/usr/bin/env bash
# One command on the server when /api/health/db returns unavailable.
set -euo pipefail
cd "$(dirname "$0")/.."
unset DATABASE_URL POSTGRES_PASSWORD
git pull origin zeeshan-dev 2>/dev/null || true
chmod +x scripts/prod-quick-heal.sh
if ./scripts/prod-quick-heal.sh; then
  exit 0
fi
npm run repair:prod-stack
