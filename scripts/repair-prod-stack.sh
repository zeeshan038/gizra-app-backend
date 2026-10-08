#!/usr/bin/env bash
# Emergency only — same steps as deploy:server (password auth, no pg_hba trust / single-user).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

chmod +x scripts/deploy-server.sh
exec ./scripts/deploy-server.sh
