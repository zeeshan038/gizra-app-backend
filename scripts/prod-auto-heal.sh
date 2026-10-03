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

log "WARN: health/db not ok — attempting deploy:server (no git pull)"
unset DATABASE_URL POSTGRES_PASSWORD
if npm run deploy:server >>"$LOG" 2>&1; then
  if curl -sf --max-time 10 "$HEALTH_URL" 2>/dev/null | grep -q '"db":"ok"'; then
    log "OK: healed via deploy:server"
    exit 0
  fi
fi

log "WARN: deploy did not heal — running fix:prod-db"
npm run fix:prod-db >>"$LOG" 2>&1 || true
if curl -sf --max-time 10 "$HEALTH_URL" 2>/dev/null | grep -q '"db":"ok"'; then
  log "OK: healed via fix:prod-db"
else
  log "FAIL: still unhealthy after auto-heal — needs human check"
  exit 1
fi
