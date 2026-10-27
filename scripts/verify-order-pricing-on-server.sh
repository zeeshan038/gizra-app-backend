#!/usr/bin/env bash
# On the VPS (SSH): run from repo root after pull + deploy.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Build + unit pricing test (no DB)"
npm run build
node scripts/test-order-line-pricing.js

echo ""
echo "==> API health (optional)"
if curl -sf http://127.0.0.1:3002/api/health/db >/dev/null 2>&1; then
  curl -s http://127.0.0.1:3002/api/health/db
  echo ""
else
  echo "  (skip — API not on 127.0.0.1:3002 or not running)"
fi

echo ""
echo "==> Inside Docker container (if gizra-backend is running)"
if docker ps --format '{{.Names}}' | grep -qx gizra-backend; then
  docker exec gizra-backend node scripts/test-order-line-pricing.js
else
  echo "  (skip — container gizra-backend not running)"
fi

echo ""
echo "Done. For full quote test, call POST /api/consumer/order/quote from the app after deploy."
