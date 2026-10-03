#!/bin/sh
set -e

export DATABASE_URL="$(node /app/docker/resolve-database-url.js)"

case "$DATABASE_URL" in
  *@postgres:*|*@postgres/*)
    ;;
  *)
    echo "FATAL: Could not resolve DATABASE_URL to postgres:5432"
    exit 1
    ;;
esac

case "${REDIS_URL:-}" in
  *127.0.0.1*|*localhost*)
    echo "FATAL: REDIS_URL uses localhost inside Docker. Use redis://redis:6379 on the server."
    exit 1
    ;;
esac

echo "Checking database connection before start…"
export DATABASE_URL
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.\$queryRaw\`SELECT 1\`
  .then(() => p.\$disconnect())
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('FATAL: Cannot connect to Postgres:', e.message);
    process.exit(1);
  });
"

exec "$@"
