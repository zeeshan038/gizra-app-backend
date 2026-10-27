#!/usr/bin/env bash
# Always prepare internal DB URL before compose (server + local Docker).
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
node scripts/prepare-compose-env.js
exec docker compose --env-file .env --env-file .env.compose "$@"
