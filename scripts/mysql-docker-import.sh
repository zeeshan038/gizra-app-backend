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
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" mariadb-admin ping -uroot -p"$ROOT_PW" --silent 2>/dev/null; then
    break
  fi
  sleep 1
done

echo "Importing dump (may take a few minutes)…"
cat "$DUMP" | docker exec -i "$CONTAINER" mariadb -uroot -p"$ROOT_PW" gizra_db

echo ""
echo "MySQL ready on 127.0.0.1:${PORT}/gizra_db"
echo "Add to .env:"
echo "MYSQL_MIGRATION_URL=mysql://root:${ROOT_PW}@127.0.0.1:${PORT}/gizra_db"
