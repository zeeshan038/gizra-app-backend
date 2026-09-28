#!/bin/sh
set -e
if [ -z "$DATABASE_URL" ]; then
  echo "FATAL: DATABASE_URL is not set. Fix .env on the host and run: docker compose up -d --force-recreate backend"
  exit 1
fi
case "$DATABASE_URL" in
  *127.0.0.1*|*localhost*)
    echo "FATAL: DATABASE_URL uses localhost/127.0.0.1. Inside Docker use:"
    echo '  DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@postgres:5432/gizra_db?schema=public"'
    echo "Then: docker compose up -d --force-recreate backend"
    exit 1
    ;;
esac
exec "$@"
