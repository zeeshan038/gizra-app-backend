#!/bin/sh
set -e

# Single source of truth: POSTGRES_PASSWORD in .env (never hand-edit DATABASE_URL for Docker).
if [ -z "${POSTGRES_PASSWORD:-}" ]; then
  echo "FATAL: POSTGRES_PASSWORD is not set. Add POSTGRES_PASSWORD=... to .env"
  exit 1
fi

export DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/gizra_db?schema=public"

case "$DATABASE_URL" in
  *127.0.0.1*|*localhost*)
    echo "FATAL: DATABASE_URL must use host postgres:5432 inside Docker."
    exit 1
    ;;
esac

case "${REDIS_URL:-}" in
  *127.0.0.1*|*localhost*)
    echo "FATAL: REDIS_URL uses localhost inside Docker. Use redis://redis:6379 (Compose sets this)."
    exit 1
    ;;
esac

echo "Using DATABASE_URL host postgres:5432 (password from POSTGRES_PASSWORD)"

exec "$@"
