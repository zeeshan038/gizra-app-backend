#!/usr/bin/env bash
# Local dev (node_modules) or server (Docker backend one-off).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TS_NODE="$ROOT/node_modules/ts-node/dist/bin.js"
SCRIPT="$ROOT/scripts/backfillVariationPricesToAdditive.ts"

if [[ -f "$TS_NODE" ]]; then
  exec node "$TS_NODE" "$SCRIPT" "$@"
fi

exec bash "$ROOT/scripts/backfill-variation-additive-server.sh" "$@"
