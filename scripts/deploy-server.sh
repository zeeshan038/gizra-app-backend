#!/usr/bin/env bash
# Production deploy on Hetzner: pull optional, build all services, verify DB + HTTP.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

unset DATABASE_URL POSTGRES_PASSWORD

if [[ "${1:-}" == "--pull" ]]; then
  git pull "${@:2}"
fi

docker compose up -d --build

chmod +x scripts/verify-db-docker.sh
sleep 4
./scripts/verify-db-docker.sh

echo "Deploy OK. Public: curl -sI https://backend-prod.gizra.app/swagger/ | head -1"
