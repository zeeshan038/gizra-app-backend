#!/usr/bin/env bash
# Allow passwordless Postgres from Docker bridge networks (backend → postgres:5432).
# Mac/host still uses SCRAM on published :5434 with DATABASE_URL password.
set -euo pipefail

CONTAINER="${POSTGRES_CONTAINER:-gizra-postgres}"

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "Postgres container not running: $CONTAINER"
  exit 1
fi

for i in $(seq 1 30); do
  docker exec "$CONTAINER" pg_isready -U postgres -d gizra_db >/dev/null 2>&1 && break
  [[ "$i" -eq 30 ]] && exit 1
  sleep 1
done

docker exec -u postgres "$CONTAINER" bash -s <<'BASH'
set -euo pipefail
HBA="${PGDATA:-/var/lib/postgresql/data}/pg_hba.conf"
MARKER="# gizra-docker-internal-trust"
if grep -qF "$MARKER" "$HBA" 2>/dev/null; then
  echo "Docker internal trust already configured in pg_hba.conf"
  exit 0
fi
# Insert before first non-comment host line (keep local socket rules intact)
TMP="$(mktemp)"
awk -v m="$MARKER" '
  !inserted && ($0 ~ /^host[^[:space:]]/ || $0 ~ /^host[[:space:]]/) {
    print m
    print "host all all 10.0.0.0/8 trust"
    print "host all all 172.16.0.0/12 trust"
    print "host all all 192.168.0.0/16 trust"
    inserted=1
  }
  { print }
  END {
    if (!inserted) {
      print m
      print "host all all 10.0.0.0/8 trust"
      print "host all all 172.16.0.0/12 trust"
      print "host all all 192.168.0.0/16 trust"
    }
  }
' "$HBA" > "$TMP"
mv "$TMP" "$HBA"
BASH

docker exec -u postgres "$CONTAINER" psql -d postgres -v ON_ERROR_STOP=1 -c 'SELECT pg_reload_conf();'
echo "OK: Docker networks can reach Postgres without password (backend container)."
