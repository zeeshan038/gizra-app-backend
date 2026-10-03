#!/usr/bin/env bash
# Allow passwordless Postgres from Docker bridge networks (backend → postgres:5432).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONTAINER="${POSTGRES_CONTAINER:-gizra-postgres}"
PGDATA="${PGDATA:-/var/lib/postgresql/data}"
INNER="$ROOT_DIR/scripts/postgres-apply-docker-trust-inner.sh"

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "Postgres container not running: $CONTAINER"
  exit 1
fi

for i in $(seq 1 45); do
  if docker exec "$CONTAINER" pg_isready -U postgres -d gizra_db >/dev/null 2>&1; then
    break
  fi
  [[ "$i" -eq 45 ]] && { echo "Postgres not ready"; exit 1; }
  sleep 1
done

docker cp "$INNER" "$CONTAINER:/tmp/gizra-apply-docker-trust.sh"
docker exec -u postgres "$CONTAINER" sh /tmp/gizra-apply-docker-trust.sh > /tmp/gizra-trust-status.txt
STATUS="$(tr -d '\r' < /tmp/gizra-trust-status.txt | head -1)"
rm -f /tmp/gizra-trust-status.txt

case "$STATUS" in
  already)
    echo "Docker internal trust already in pg_hba.conf"
    ;;
  updated)
    echo "Applied Docker internal trust rules to pg_hba.conf"
    docker exec -u postgres "$CONTAINER" pg_ctl reload -D "$PGDATA"
    ;;
  *)
    echo "FAIL: pg_hba trust step (expected already|updated, got: ${STATUS:-empty})"
    docker logs --tail=15 "$CONTAINER" 2>&1 || true
    exit 1
    ;;
esac

echo "OK: Docker networks can use Postgres trust (backend → postgres:5432)."
