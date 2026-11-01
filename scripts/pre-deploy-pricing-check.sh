#!/usr/bin/env bash
# Run before production deploy (local CI or on VPS after build).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> TypeScript build"
npm run build

echo ""
echo "==> Quote / place-order line pricing (dist)"
node scripts/test-order-line-pricing.js

echo ""
echo "==> Variation catalog normalize — drinks / sizes (dist)"
node scripts/test-variation-catalog-normalize.js

echo ""
echo "All pre-deploy pricing checks PASSED."
