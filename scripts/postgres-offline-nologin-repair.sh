#!/usr/bin/env bash
# One-off: fix postgres NOLOGIN when ensure-postgres-password cannot use peer psql.
# Usage: ./scripts/postgres-offline-nologin-repair.sh
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
CONTAINER="${POSTGRES_CONTAINER:-gizra-postgres}"
chmod +x scripts/read-db-password-from-env.sh
PW="$(./scripts/read-db-password-from-env.sh .env)"
SQL_PASS="${PW//\'/\'\'}"
vol="$(docker inspect "$CONTAINER" --format '{{ range .Mounts }}{{ if eq .Destination "/var/lib/postgresql/data" }}{{ .Name }}{{ end }}{{ end }}')"
image="$(docker inspect "$CONTAINER" --format '{{.Config.Image}}')"
repair_sql="$(mktemp)"
printf "ALTER ROLE postgres WITH LOGIN SUPERUSER PASSWORD '%s';\n" "${SQL_PASS}" >"$repair_sql"
docker stop "$CONTAINER" gizra-backend 2>/dev/null || true
echo "Offline repair on volume ${vol}…"
docker run --rm -i -u postgres \
  -v "${vol}:/var/lib/postgresql/data" \
  "$image" \
  bash -c 'postgres --single -D /var/lib/postgresql/data template1' \
  <"$repair_sql"
rm -f "$repair_sql"
docker start "$CONTAINER"
echo "Done. Run: npm run deploy:server"
