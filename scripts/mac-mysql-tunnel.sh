#!/usr/bin/env bash
# Forward Mac localhost:3307 → PHP/MySQL host (default: same VPS as Postgres).
# Use with MYSQL_MIGRATION_URL=mysql://USER:PASS@127.0.0.1:3307/gizra_db
set -euo pipefail

HOST="${GIZRA_MYSQL_SSH_HOST:-${GIZRA_SSH_HOST:-root@167.233.245.44}}"
LOCAL_PORT="${GIZRA_MYSQL_LOCAL_PORT:-3307}"
REMOTE_BIND="${GIZRA_MYSQL_REMOTE_BIND:-127.0.0.1:3306}"

echo "Tunnel: localhost:${LOCAL_PORT} → ${HOST} (${REMOTE_BIND})"
echo "MYSQL_MIGRATION_URL=mysql://USER:PASS@127.0.0.1:${LOCAL_PORT}/gizra_db"
exec ssh -N -L "${LOCAL_PORT}:${REMOTE_BIND}" "$HOST"
