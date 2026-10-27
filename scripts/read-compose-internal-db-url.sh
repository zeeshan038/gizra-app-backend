#!/usr/bin/env bash
# Print GIZRA_DATABASE_URL_INTERNAL from .env.compose (safe for URLs with & and special chars).
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_ENV="${1:-$ROOT_DIR/.env.compose}"
if [[ ! -f "$COMPOSE_ENV" ]]; then
  echo "Missing $COMPOSE_ENV — run: node scripts/prepare-compose-env.js" >&2
  exit 1
fi
line="$(grep -E '^GIZRA_DATABASE_URL_INTERNAL=' "$COMPOSE_ENV" | head -1 || true)"
if [[ -z "$line" ]]; then
  echo "GIZRA_DATABASE_URL_INTERNAL not found in $COMPOSE_ENV" >&2
  exit 1
fi
val="${line#GIZRA_DATABASE_URL_INTERNAL=}"
val="${val#\"}"
val="${val%\"}"
printf '%s' "$val"
