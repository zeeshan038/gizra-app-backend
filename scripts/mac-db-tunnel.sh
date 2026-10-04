#!/usr/bin/env bash
# Forward Mac localhost:5434 → Hetzner Postgres (Docker 5434 on the VPS).
# Keep this running while you use npm run dev against prod data.
set -euo pipefail

HOST="${GIZRA_SSH_HOST:-root@167.233.245.44}"
LOCAL_PORT="${GIZRA_DB_LOCAL_PORT:-5434}"
REMOTE_BIND="${GIZRA_DB_REMOTE_BIND:-127.0.0.1:5434}"

echo "Tunnel: localhost:${LOCAL_PORT} → ${HOST} (${REMOTE_BIND})"
echo "Use DATABASE_URL @127.0.0.1:${LOCAL_PORT} in Mac .env (see env.mac.example)."
exec ssh -N -L "${LOCAL_PORT}:${REMOTE_BIND}" "$HOST"
