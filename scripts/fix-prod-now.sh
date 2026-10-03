#!/usr/bin/env bash
# One command on the server when /api/health/db returns unavailable.
set -euo pipefail
cd "$(dirname "$0")/.."
unset DATABASE_URL POSTGRES_PASSWORD
git pull origin zeeshan-dev 2>/dev/null || true
npm run repair:prod-stack
