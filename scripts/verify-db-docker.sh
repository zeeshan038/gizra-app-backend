#!/usr/bin/env bash
# Run on the API server (167.233.245.44) inside the gizra-backend compose directory.
set -euo pipefail

COMPOSE="${COMPOSE:-docker compose}"
BACKEND="${BACKEND_CONTAINER:-gizra-backend}"
POSTGRES="${POSTGRES_CONTAINER:-gizra-postgres}"

echo "=== Backend DATABASE_URL (host only) ==="
docker exec "$BACKEND" sh -c 'echo "$DATABASE_URL" | sed -E "s#(postgresql://[^:]+:)[^@]+#\1***#"' || {
  echo "Backend container not running: $BACKEND"
  exit 1
}

HOST=$(docker exec "$BACKEND" sh -c 'echo "$DATABASE_URL"' | sed -nE 's#.*@([^:/]+).*#\1#p')
echo "DB host in URL: ${HOST:-unknown}"

if [[ "$HOST" == "167.233.245.44" || "$HOST" == "127.0.0.1" || "$HOST" == "localhost" ]]; then
  echo "FAIL: API container should use host postgres:5432, not $HOST"
  echo "Remove DATABASE_URL from .env; set POSTGRES_PASSWORD only, then: docker compose up -d --force-recreate backend"
  exit 1
fi

echo "=== Postgres ping from backend container ==="
docker exec "$BACKEND" sh -c 'node -e "
const { PrismaClient } = require(\"@prisma/client\");
const p = new PrismaClient();
p.\$queryRaw\`SELECT 1\`.then(() => { console.log(\"OK: Prisma can query DB\"); process.exit(0); })
  .catch((e) => { console.error(\"FAIL:\", e.message); process.exit(1); });
"' || exit 1

echo "=== Postgres container ==="
docker exec "$POSTGRES" psql -U postgres -d gizra_db -c 'SELECT 1 AS ok;' >/dev/null && echo "OK: psql inside postgres container"

echo "All checks passed."
