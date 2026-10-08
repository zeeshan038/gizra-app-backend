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
  case \"\$DATABASE_URL\" in
    postgresql://*:*@postgres:5432/*|postgresql://*:*@postgres:5432?*) ;;
    *) echo 'FAIL: URL must be postgresql://user:password@postgres:5432/...'; exit 1 ;;
  esac
" || exit 1

HOST=$(docker exec "$BACKEND" sh -c "$EXPORT_SNIPPET; node -e \"
const r=process.env.DATABASE_URL||'';
const u=new URL(r.replace(/^postgresql:/i,'http:'));
process.stdout.write(u.hostname);
\"" 2>/dev/null | tr -d '\r\n')
if [[ "$HOST" == "127.0.0.1" || "$HOST" == "localhost" ]]; then
  echo "FAIL: API container must not use localhost for Postgres"
  exit 1
fi
if [[ "$HOST" != "postgres" ]]; then
  echo "FAIL: API container must use host postgres (got ${HOST:-empty}) — .env 167.x leaked; run npm run deploy:server"
  exit 1
fi

echo "=== HTTP health (running API process) ==="
if ! docker exec "$BACKEND" node -e "
require('http').get('http://127.0.0.1:3000/swagger/', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1));
" 2>/dev/null; then
  echo "FAIL: /swagger/ not 200"
  exit 1
fi
echo "OK: API responds 200 on /swagger/"

echo "=== DB health route ==="
if docker exec "$BACKEND" node -e "
require('http').get('http://127.0.0.1:3000/api/health/db', (r) => {
  let b=''; r.on('data',d=>b+=d); r.on('end',()=>process.exit(r.statusCode===200?0:1));
}).on('error',()=>process.exit(1));
" 2>/dev/null; then
  echo "OK: GET /api/health/db"
else
  echo "FAIL: /api/health/db not 200 — DB auth or Prisma broken"
  exit 1
fi

if docker logs "$BACKEND" 2>&1 | tail -40 | grep -q 'Connected to PostgreSQL Database via Prisma'; then
  echo "OK: running API process is connected to Postgres (authoritative)"
else
  echo "WARN: logs missing Connected line — running Prisma ping…"
  prisma_ok=0
  for _ in 1 2 3; do
    if docker exec "$BACKEND" sh -c "
      $EXPORT_SNIPPET
      node -e \"
const { PrismaClient } = require('@prisma/client');
new PrismaClient().\\\$queryRaw\\\`SELECT 1\\\`.then(() => process.exit(0)).catch(() => process.exit(1));
\"" 2>/dev/null; then
      prisma_ok=1
      break
    fi
    sleep 2
  done
  if [[ "$prisma_ok" -ne 1 ]]; then
    echo "FAIL: API up but DB not connected — check docker logs gizra-backend"
    exit 1
  fi
  echo "OK: Prisma ping succeeded"
fi

echo "=== Postgres container (peer, optional) ==="
if docker exec -u postgres "$POSTGRES" psql -d gizra_db -c 'SELECT 1 AS ok;' >/dev/null 2>&1; then
  echo "OK: psql as OS user postgres"
else
  echo "SKIP: peer psql failed (NOLOGIN noise — API connection above is what matters)"
  echo "      To fix for manual psql: npm run deploy:server (syncs POSTGRES_PASSWORD)"
fi

echo "All checks passed."
