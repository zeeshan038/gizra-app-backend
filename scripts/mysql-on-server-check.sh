#!/usr/bin/env bash
# Quick check: is MySQL/MariaDB reachable for migration on this host?
set -euo pipefail

echo "=== Port 3306 ==="
ss -tlnp 2>/dev/null | grep 3306 || echo "(no listener on 3306)"

echo ""
echo "=== Docker DB containers ==="
docker ps --format 'table {{.Names}}\t{{.Ports}}' 2>/dev/null | grep -iE 'mysql|maria|NAME' || echo "(no mysql/mariadb container)"

echo ""
echo "=== mysql client ==="
if command -v mysql >/dev/null 2>&1; then
  echo "installed: $(mysql --version)"
  if mysql -h127.0.0.1 -uroot -e "SELECT 1" 2>/dev/null; then
    echo "root@127.0.0.1: OK (no password)"
  elif mysql -h127.0.0.1 -uroot -p -e "SELECT 1" 2>/dev/null; then
    echo "root@127.0.0.1: OK (with password)"
  else
    echo "root@127.0.0.1: cannot connect — set MYSQL_MIGRATION_URL or import dump (see docs/MYSQL_TO_POSTGRES_MIGRATION.md)"
  fi
else
  echo "not installed — apt install -y mariadb-client"
fi
