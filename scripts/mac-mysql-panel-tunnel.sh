#!/usr/bin/env bash
# Forward Mac localhost:3308 → CyberPanel MySQL (127.0.0.1:3306 on panel server).
#
# Terminal A: ./scripts/mac-db-tunnel.sh          (Postgres prod)
# Terminal B: ./scripts/mac-mysql-panel-tunnel.sh (PHP MySQL prod)
# Terminal C: set MYSQL_MIGRATION_URL in .env, then ./scripts/migrate-on-mac.sh
#
# Example .env (URL-encode special chars in password, e.g. * → %2A):
#   MYSQL_MIGRATION_URL=mysql://DB_USER:DB_PASS@127.0.0.1:3308/DB_NAME
set -euo pipefail

# panel.gizra.app and 46.225.217.221 are the same host; IP often matches saved SSH keys.
HOST="${GIZRA_PANEL_SSH:-root@46.225.217.221}"
LOCAL_PORT="${GIZRA_MYSQL_PANEL_LOCAL_PORT:-3308}"
REMOTE_BIND="${GIZRA_MYSQL_PANEL_REMOTE_BIND:-127.0.0.1:3306}"

echo "Tunnel: localhost:${LOCAL_PORT} → ${HOST} (${REMOTE_BIND})"
echo "Set MYSQL_MIGRATION_URL in .env (MySQL user/pass from Laravel .env, port ${LOCAL_PORT})."
echo ""
echo "SSH password prompt = CyberPanel ROOT login (NOT the MySQL DB password)."
echo "If you use an SSH key, there may be no prompt. Test: ssh ${HOST}"
echo "Leave this terminal open (blank screen is normal)."
echo ""
exec ssh -N \
  -o ExitOnForwardFailure=yes \
  -o ConnectTimeout=15 \
  -o ServerAliveInterval=30 \
  -L "${LOCAL_PORT}:${REMOTE_BIND}" \
  "$HOST"
