#!/usr/bin/env bash
# Create or reset platform admin (default admin@gizra.com / 12345678).
# Usage:
#   ./scripts/create-admin.sh
#   ./scripts/create-admin.sh --email=admin@gizra.com --password=12345678
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
exec npx ts-node scripts/createAdmin.ts "$@"
