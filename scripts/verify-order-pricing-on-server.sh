#!/usr/bin/env bash
# On the VPS (SSH): run from repo root after deploy.
# git pull alone does NOT update the running API — rebuild with: npm run deploy:server
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

run_host_pricing_tests() {
  echo "==> Host pricing tests (from current git tree + dist build)"
  if ! npx prisma generate >/dev/null 2>&1; then
    echo "  (skip — prisma generate failed; run npm install on host if needed)"
    return 1
  fi
  npm run build
  node scripts/test-order-line-pricing.js
  node scripts/test-variation-catalog-normalize.js
}

container_has_file() {
  docker exec gizra-backend test -f "$1" 2>/dev/null
}

echo "==> Pricing tests inside Docker (matches RUNNING production API)"
if docker ps --format '{{.Names}}' | grep -qx gizra-backend; then
  docker exec gizra-backend node scripts/test-order-line-pricing.js

  if container_has_file /app/scripts/test-variation-catalog-normalize.js; then
    docker exec gizra-backend node scripts/test-variation-catalog-normalize.js
  else
    echo ""
    echo "WARN: Running container is OLD (missing test-variation-catalog-normalize.js)."
    echo "      git pull updated the host repo only — rebuild the backend image:"
    echo "        cd ~/gizra-app-backend && npm run deploy:server"
    echo ""
    run_host_pricing_tests || true
    echo ""
    echo "FAIL: Rebuild container so live API includes latest pricing/variation code."
    exit 1
  fi
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
echo "All container pricing checks PASSED (running API matches tests)."
echo "Optional: POST /api/consumer/order/quote from the app to confirm checkout."
