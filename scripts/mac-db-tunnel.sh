#!/usr/bin/env bash
# Forward Mac localhost:5434 → Hetzner Postgres (Docker 5434 on the VPS).
# Keep this running while you use npm run dev / migration against prod data.
set -euo pipefail

HOST="${GIZRA_SSH_HOST:-root@167.233.245.44}"
LOCAL_PORT="${GIZRA_DB_LOCAL_PORT:-5434}"
REMOTE_BIND="${GIZRA_DB_REMOTE_BIND:-127.0.0.1:5434}"

echo "Tunnel: localhost:${LOCAL_PORT} → ${HOST} (${REMOTE_BIND})"
echo "Use DATABASE_URL @127.0.0.1:${LOCAL_PORT} in Mac .env (see env.mac.example)."
echo ""
echo "If SSH uses a key, there may be NO password prompt."
echo "A blank screen after connect is NORMAL — the tunnel stays open until Ctrl+C."
echo "In another terminal, check: pg_isready -h 127.0.0.1 -p ${LOCAL_PORT}"
echo "If you see 'Address already in use', a tunnel (or Docker) is already on ${LOCAL_PORT} —"
echo "if pg_isready succeeds, you can skip starting this script again."
echo ""

exec ssh -N \
  -o ExitOnForwardFailure=yes \
  -o ConnectTimeout=15 \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -L "${LOCAL_PORT}:${REMOTE_BIND}" \
  "$HOST"


