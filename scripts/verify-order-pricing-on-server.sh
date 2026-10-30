#!/usr/bin/env bash
# On the VPS (SSH): run from repo root after deploy.
# Authoritative check = inside gizra-backend container (same as production API).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Pricing test inside Docker (authoritative)"
if docker ps --format '{{.Names}}' | grep -qx gizra-backend; then
  docker exec gizra-backend node scripts/test-order-line-pricing.js
else
  echo "FAIL: container gizra-backend is not running"
  exit 1
fi

echo ""
echo "==> API health"
if curl -sf http://127.0.0.1:3002/api/health/db >/dev/null 2>&1; then
  curl -s http://127.0.0.1:3002/api/health/db
  echo ""
else
  echo "  (skip — API not on 127.0.0.1:3002)"
fi

echo ""
echo "==> Optional: host build + test (needs npx prisma generate on the VPS)"
if npx prisma generate >/dev/null 2>&1 && npm run build >/dev/null 2>&1; then
  node scripts/test-order-line-pricing.js
else
  echo "  (skipped — host node_modules/Prisma out of sync; Docker test above is enough)"
fi

echo ""
echo "Done. Re-test checkout with the Flutter app (POST /api/consumer/order/quote)."
