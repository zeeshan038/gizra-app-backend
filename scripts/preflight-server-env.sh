#!/usr/bin/env bash
# Fail fast before compose — avoids P1000 from missing password or Mac-style .env on server.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "FAIL: missing $ENV_FILE (copy env.server.example)"
  exit 1
fi

if grep -qE '^DATABASE_URL=.*(127\.0\.0\.1|localhost)' "$ENV_FILE"; then
  echo "FAIL: server DATABASE_URL must not use localhost (use postgres:5432 or server IP :5434)."
  exit 1
fi

PW="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | sed -nE 's#.*://[^:]+:([^@]+)@.*#\1#p' | head -1)"
if [[ -z "$PW" ]]; then
  echo "FAIL: DATABASE_URL must include a password (postgresql://postgres:YOUR_PASSWORD@...)."
  exit 1
fi

if grep -qE '^REDIS_URL=.*(127\.0\.0\.1|localhost)' "$ENV_FILE"; then
  echo "FAIL: on server set REDIS_URL=redis://redis:6379"
  exit 1
fi

if [[ -n "${DATABASE_URL:-}" || -n "${POSTGRES_PASSWORD:-}" ]]; then
  echo "WARN: unset DATABASE_URL and POSTGRES_PASSWORD in this shell (they override .env.compose)."
fi

echo "OK: server .env preflight (password present, Redis/DB hosts look sane)."
