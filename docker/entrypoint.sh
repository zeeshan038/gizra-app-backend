#!/bin/sh
set -e

if [ -z "${DATABASE_URL:-}" ]; then
  echo "FATAL: DATABASE_URL is not set. Add it to .env (host must be postgres:5432 inside Docker)."
  exit 1
fi

case "$DATABASE_URL" in
  *127.0.0.1*|*localhost*|*167.233.245.44*)
    echo "FATAL: Inside Docker, DATABASE_URL must use host postgres:5432 (not localhost or the server public IP)."
    exit 1
    ;;
esac

case "${REDIS_URL:-}" in
  *127.0.0.1*|*localhost*)
    echo "FATAL: REDIS_URL uses localhost inside Docker. Use redis://redis:6379."
    exit 1
    ;;
esac

exec "$@"
