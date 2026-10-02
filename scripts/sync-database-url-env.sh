#!/usr/bin/env bash
# Write DATABASE_URL into .env for host-side tools (psql, prisma on SSH session).
# The backend container still uses Compose: @postgres:5432 (overrides .env DATABASE_URL).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "Missing .env"
  exit 1
fi

PW="$(
  grep -E '^POSTGRES_PASSWORD=' .env | head -1 | cut -d= -f2- | tr -d '\r"' | sed "s/^'//;s/'$//"
)"
if [[ -z "$PW" ]]; then
  echo "Add POSTGRES_PASSWORD=... to .env first."
  exit 1
fi

HOST="${POSTGRES_HOST:-127.0.0.1}"
PORT="${POSTGRES_PORT:-5434}"
DB="${POSTGRES_DB:-gizra_db}"
ENC=$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$PW")
URL="postgresql://postgres:${ENC}@${HOST}:${PORT}/${DB}?schema=public"

if grep -qE '^DATABASE_URL=' .env; then
  sed -i.bak "s|^DATABASE_URL=.*|DATABASE_URL=${URL}|" .env
  rm -f .env.bak
else
  echo "DATABASE_URL=${URL}" >> .env
fi

echo "DATABASE_URL set for host tools (${HOST}:${PORT})."
echo "Backend container still uses @postgres:5432 via docker-compose.yml."
