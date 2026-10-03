#!/bin/sh
set -e

if [ -z "${DATABASE_URL:-}" ]; then
  echo "FATAL: DATABASE_URL is not set in .env"
  exit 1
fi

# Inside the API container, localhost is wrong (that is the app container, not Postgres).
case "$DATABASE_URL" in
  *127.0.0.1*|*localhost*)
    echo "FATAL: DATABASE_URL must not use localhost inside the backend container. Use the server IP:5434 or host postgres:5432."
    exit 1
    ;;
esac

case "${REDIS_URL:-}" in
  *127.0.0.1*|*localhost*)
    echo "FATAL: REDIS_URL uses localhost inside Docker. Use redis://redis:6379 on the server."
    exit 1
    ;;
esac

exec "$@"
