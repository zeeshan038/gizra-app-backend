#!/usr/bin/env bash
# Replace `zones` rows in local Docker MySQL with polygon data from a dump that still has
# binary-safe geometry (e.g. deliverymain/db_2026-08-15.sql — NOT deliverymain_db_2026-08-19.sql,
# which was re-saved as UTF-8 and corrupts POLYGON bytes as EFBFBD).
#
# Usage:
#   ./scripts/overlay-mysql-zones-from-dump.sh /path/to/db_2026-08-15.sql
#   npm run db:migrate-from-mysql -- --apply --only-table zones
set -euo pipefail

DUMP="${1:-}"
CONTAINER="${GIZRA_MYSQL_DOCKER:-gizra-mysql-migrate}"
ROOT_PW="${GIZRA_MYSQL_ROOT_PASSWORD:-migrate_local_root}"
DB="${GIZRA_MYSQL_DATABASE:-gizra_db}"
TMP="$(mktemp /tmp/gizra_zones_only.XXXXXX.sql)"

if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "Usage: $0 /path/to/mysql-dump-with-intact-zones.sql"
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Container $CONTAINER not running. Import MySQL first: ./scripts/mysql-docker-import.sh ..."
  exit 1
fi

python3 - "$DUMP" "$TMP" "$DB" << 'PY'
import sys
from pathlib import Path
src = Path(sys.argv[1])
out = Path(sys.argv[2])
db = sys.argv[3].encode()
text = src.read_bytes()
start = text.find(b"LOCK TABLES `zones` WRITE;")
end = text.find(b"UNLOCK TABLES;", start)
if start < 0 or end < 0:
    raise SystemExit("Could not find zones LOCK/UNLOCK block in dump")
chunk = text[start : end + len(b"UNLOCK TABLES;\n")]
header = b"USE `" + db + b"`;\nSET NAMES binary;\nDELETE FROM `zones`;\n"
out.write_bytes(header + chunk)
print(f"Wrote {out} ({out.stat().st_size} bytes)")
PY

docker cp "$TMP" "$CONTAINER:/tmp/gizra_zones_only.sql"
docker exec -e MYSQL_PWD="$ROOT_PW" "$CONTAINER" \
  sh -ec 'mariadb --binary-mode=1 -uroot '"$DB"' < /tmp/gizra_zones_only.sql'
rm -f "$TMP"

echo "Zones replaced in Docker MySQL ($DB). Verify:"
echo "  docker exec -e MYSQL_PWD=$ROOT_PW $CONTAINER mariadb -uroot $DB -e \"SELECT id,name,ST_AsText(coordinates) FROM zones LIMIT 3;\""
