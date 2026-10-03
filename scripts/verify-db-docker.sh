#!/usr/bin/env bash
# Run on the API server inside the gizra-backend compose directory.
set -euo pipefail

BACKEND="${BACKEND_CONTAINER:-gizra-backend}"
POSTGRES="${POSTGRES_CONTAINER:-gizra-postgres}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if ! docker inspect "$BACKEND" >/dev/null 2>&1; then
  echo "Backend container not running: $BACKEND"
  exit 1
fi

EXPORT_SNIPPET="$(tr '\n' ' ' < "$ROOT_DIR/scripts/docker-export-database-url.sh")"

echo "=== Backend DB URL ==="
docker exec "$BACKEND" sh -c "
  $EXPORT_SNIPPET
  echo \"\$DATABASE_URL\" | sed -E 's#(postgresql://[^:]+:)[^@]+#\\1***#'
  echo \"\$DATABASE_URL\" | sed -nE 's#.*@([^:/]+).*#DB host in URL: \\1#p'
" || exit 1

HOST=$(docker exec "$BACKEND" sh -c "$EXPORT_SNIPPET; echo \"\$DATABASE_URL\"" | sed -nE 's#.*@([^:/]+).*#\1#p')
if [[ "$HOST" == "167.233.245.44" || "$HOST" == "127.0.0.1" || "$HOST" == "localhost" ]]; then
  echo "FAIL: API container should use host postgres:5432, not $HOST"
  exit 1
fi

echo "=== HTTP health (running API process) ==="
if docker exec "$BACKEND" node -e "
require('http').get('http://127.0.0.1:3000/swagger/', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1));
" 2>/dev/null; then
  echo "OK: API responds 200 on /swagger/"
else
  echo "FAIL: /swagger/ not 200"
  exit 1
fi

echo "=== Postgres ping from backend container ==="
docker exec "$BACKEND" sh -c "
  $EXPORT_SNIPPET
  node -e \"
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.\\\$queryRaw\\\`SELECT 1\\\`.then(() => { console.log('OK: Prisma can query DB'); process.exit(0); })
  .catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
\"
" || exit 1

echo "=== Postgres container (peer) ==="
docker exec "$POSTGRES" psql -U postgres -d gizra_db -c 'SELECT 1 AS ok;' >/dev/null && echo "OK: psql inside postgres container"

echo "All checks passed."
