#!/usr/bin/env bash
# Count rows in local gizra-mysql-migrate (avoids broken Homebrew mysql client on Mac).
set -euo pipefail
CONTAINER="${GIZRA_MYSQL_DOCKER:-gizra-mysql-migrate}"
PW="${GIZRA_MYSQL_ROOT_PASSWORD:-migrate_local_root}"
TABLE="${1:-orders}"
docker exec -e MYSQL_PWD="$PW" "$CONTAINER" \
  mariadb -uroot gizra_db -e "SELECT COUNT(*) AS c FROM \`${TABLE}\`;"
