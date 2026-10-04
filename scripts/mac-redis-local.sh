#!/usr/bin/env bash
# Optional: Redis on Mac so local dev does not use prod Redis.
set -euo pipefail
NAME="${GIZRA_REDIS_CONTAINER:-gizra-redis-local}"
PORT="${GIZRA_REDIS_PORT:-6379}"
if docker ps -a --format '{{.Names}}' | grep -qx "$NAME"; then
  docker start "$NAME" >/dev/null 2>&1 || true
else
  docker run -d --name "$NAME" -p "${PORT}:6379" redis:7
fi
echo "REDIS_URL=redis://127.0.0.1:${PORT}"
