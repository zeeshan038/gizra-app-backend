#!/usr/bin/env bash
# One-off local MySQL for migration testing (imports a mysqldump into gizra_db).
# Usage: ./scripts/mysql-docker-import.sh /path/to/dump.sql
set -euo pipefail

DUMP="${1:-}"
CONTAINER="${GIZRA_MYSQL_DOCKER:-gizra-mysql-migrate}"
ROOT_PW="${GIZRA_MYSQL_ROOT_PASSWORD:-migrate_local_root}"
PORT="${GIZRA_MYSQL_DOCKER_PORT:-3306}"

if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "Usage: $0 /path/to/mysqldump.sql"
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running."
  exit 1
fi

docker rm -f "$CONTAINER" 2>/dev/null || true
docker run -d --name "$CONTAINER" \
  -e MARIADB_ROOT_PASSWORD="$ROOT_PW" \
  -e MARIADB_DATABASE=gizra_db \
  -p "${PORT}:3306" \
  mariadb:10.11

echo "Waiting for MariaDB…"
for _ in $(seq 1 90); do
  if docker exec -e MYSQL_PWD="$ROOT_PW" "$CONTAINER" mariadb-admin ping -uroot --silent 2>/dev/null; then
    if docker exec -e MYSQL_PWD="$ROOT_PW" "$CONTAINER" mariadb -uroot -e "SELECT 1" >/dev/null 2>&1; then
      break
    fi
  fi
  sleep 1
done
sleep 2

echo "Importing dump (may take a few minutes)…"
# Do NOT pipe the SQL through the shell — binary POLYGON bytes in `zones` get UTF-8 mojibake (EFBFBD).
docker cp "$DUMP" "$CONTAINER:/tmp/gizra_import.sql"
docker exec -e MYSQL_PWD="$ROOT_PW" "$CONTAINER" \
  sh -ec 'mariadb --binary-mode=1 -uroot gizra_db < /tmp/gizra_import.sql'
docker exec "$CONTAINER" rm -f /tmp/gizra_import.sql

echo ""
echo "MySQL ready on 127.0.0.1:${PORT}/gizra_db"
echo "Add to .env:"
echo "MYSQL_MIGRATION_URL=mysql://root:${ROOT_PW}@127.0.0.1:${PORT}/gizra_db"
