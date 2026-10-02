#!/bin/sh
set -e
if [ -z "$DATABASE_URL" ]; then
  echo "FATAL: DATABASE_URL is not set. Set POSTGRES_PASSWORD in .env and run: docker compose up -d --force-recreate backend"
  exit 1
fi
case "$DATABASE_URL" in
  *127.0.0.1*|*localhost*)
    echo "FATAL: DATABASE_URL uses localhost/127.0.0.1. Inside Docker use host postgres:5432."
    echo "Set POSTGRES_PASSWORD in .env — Compose builds DATABASE_URL automatically."
    exit 1
    ;;
  *@postgres:5432*)
    ;;
  *)
    echo "FATAL: DATABASE_URL must use host postgres:5432 inside Docker (got: $DATABASE_URL)"
    exit 1
    ;;
esac
exec "$@"
