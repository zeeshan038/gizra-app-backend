#!/usr/bin/env bash
# Last-resort: reset postgres role password when P1000 persists (rolcanlogin off or wrong password).
# Run on the server as root from gizra-app-backend. Requires gizra-postgres running.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
ENV_FILE="${ENV_FILE:-.env}"
CONTAINER="${POSTGRES_CONTAINER:-gizra-postgres}"
PW="$(
  grep -E '^POSTGRES_PASSWORD=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '\r"' | sed "s/^'//;s/'$//"
)"

if [[ -z "$PW" ]]; then
  echo "Set POSTGRES_PASSWORD=... in $ENV_FILE first."
  exit 1
fi

echo "Waiting for Postgres..."
for i in $(seq 1 30); do
  docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break
  [[ "$i" -eq 30 ]] && { echo "Postgres not ready"; exit 1; }
  sleep 2
done

echo "Trying normal peer-auth password sync..."
if docker exec -u postgres "$CONTAINER" psql -d postgres -v ON_ERROR_STOP=1 \
  -c "ALTER ROLE postgres WITH LOGIN SUPERUSER PASSWORD '${PW//\'/\'\'}';" 2>/dev/null; then
  echo "ALTER ROLE succeeded (peer auth)."
else
  echo "Peer auth failed — using temporary trust in pg_hba.conf..."
  docker exec -u root "$CONTAINER" bash -s <<'INNER'
set -e
HBA=/var/lib/postgresql/data/pg_hba.conf
cp "$HBA" "${HBA}.bak.emergency"
grep -q '^local all all trust' "$HBA" || sed -i '1ilocal all all trust' "$HBA"
grep -q '^host all all 127.0.0.1/32 trust' "$HBA" || sed -i '2ihost all all 127.0.0.1/32 trust' "$HBA"
su -s /bin/sh postgres -c "pg_ctl reload -D /var/lib/postgresql/data"
INNER
  docker exec "$CONTAINER" psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 \
    -c "ALTER ROLE postgres WITH LOGIN SUPERUSER PASSWORD '${PW//\'/\'\'}';"
  docker exec -u root "$CONTAINER" bash -s <<'INNER'
set -e
HBA=/var/lib/postgresql/data/pg_hba.conf
if [[ -f "${HBA}.bak.emergency" ]]; then
  mv "${HBA}.bak.emergency" "$HBA"
  su -s /bin/sh postgres -c "pg_ctl reload -D /var/lib/postgresql/data"
fi
INNER
  echo "Emergency reset done; pg_hba restored."
fi

echo "Testing TCP login with POSTGRES_PASSWORD..."
docker run --rm --network gizra-app-backend_default postgres:16-alpine \
  psql "postgresql://postgres:${PW}@postgres:5432/gizra_db" -c "SELECT 1 AS ok;"

export POSTGRES_PASSWORD="$PW"
docker compose up -d --force-recreate backend
sleep 3
docker logs --tail=15 gizra-backend
