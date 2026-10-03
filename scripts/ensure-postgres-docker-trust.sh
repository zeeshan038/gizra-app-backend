#!/usr/bin/env bash
# Allow passwordless Postgres from Docker bridge networks (backend → postgres:5432).
# Requires postgres role LOGIN (run ensure-postgres-login / repair first if NOLOGIN).
set -euo pipefail

CONTAINER="${POSTGRES_CONTAINER:-gizra-postgres}"
PGDATA="${PGDATA:-/var/lib/postgresql/data}"

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "Postgres container not running: $CONTAINER"
  exit 1
fi

for i in $(seq 1 30); do
  docker exec "$CONTAINER" pg_isready -U postgres -d gizra_db >/dev/null 2>&1 && break
  [[ "$i" -eq 30 ]] && exit 1
  sleep 1
done

STATUS="$(docker exec -u postgres "$CONTAINER" bash -s <<'BASH'
set -euo pipefail
HBA="${PGDATA:-/var/lib/postgresql/data}/pg_hba.conf"
MARKER="# gizra-docker-internal-trust"
if grep -qF "$MARKER" "$HBA" 2>/dev/null; then
  echo "already"
  exit 0
fi
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
echo "updated"
BASH
)"

case "$STATUS" in
  already)
    echo "Docker internal trust already in pg_hba.conf"
    ;;
  updated)
    echo "Applied Docker internal trust rules to pg_hba.conf"
    docker exec -u postgres "$CONTAINER" pg_ctl reload -D "$PGDATA"
    ;;
  *)
    echo "Unexpected status from pg_hba update: $STATUS"
    exit 1
    ;;
esac

echo "OK: Docker networks can use Postgres trust (backend → postgres:5432)."
