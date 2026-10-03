#!/bin/sh
set -e

if [ -z "${DATABASE_URL:-}" ]; then
  echo "FATAL: DATABASE_URL is not set in .env"
  exit 1
fi

# Backend must use the compose Postgres service (not public IP hairpin or localhost).
case "$DATABASE_URL" in
  *@postgres:*|*@postgres/*)
    ;;
  *)
    echo "FATAL: DATABASE_URL must use host postgres:5432 inside Docker."
    echo "       On the server run: npm run deploy:server (generates .env.compose from .env)."
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
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.\$queryRaw\`SELECT 1\`
  .then(() => p.\$disconnect())
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('FATAL: Cannot connect to Postgres (fix password with npm run repair:prod-stack on server):', e.message);
    process.exit(1);
  });
"

exec "$@"
