#!/usr/bin/env bash
# Run ON THE SERVER (cron). End users never SSH — this fixes DB/API before they notice.
# Checks local API port (not Cloudflare). Safe to run every 3–5 minutes.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
LOG="${GIZRA_AUTO_HEAL_LOG:-/var/log/gizra-auto-heal.log}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3002/api/health/db}"

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" | tee -a "$LOG"; }

if curl -sf --max-time 10 "$HEALTH_URL" 2>/dev/null | grep -q '"db":"ok"'; then
  exit 0
fi

log "WARN: health/db not ok — quick-heal (backend restart only)"
unset DATABASE_URL POSTGRES_PASSWORD
if ./scripts/prod-quick-heal.sh >>"$LOG" 2>&1; then
  log "OK: healed via prod-quick-heal"
  exit 0
fi

log "WARN: quick-heal failed — one deploy:server (no git pull, no single-user repair)"
if npm run deploy:server >>"$LOG" 2>&1; then
  if curl -sf --max-time 10 "$HEALTH_URL" 2>/dev/null | grep -q '"db":"ok"'; then
    log "OK: healed via deploy:server"
    exit 0
  fi
fi

log "FAIL: still unhealthy — run manually: cd ~/gizra-app-backend && npm run fix:prod-db (do NOT loop cron repair)"
exit 1
