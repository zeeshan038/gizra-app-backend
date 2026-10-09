
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
ENV_FILE="${ENV_FILE:-.env}"
CONTAINER="${POSTGRES_CONTAINER:-gizra-postgres}"

chmod +x "$ROOT_DIR/scripts/read-db-password-from-env.sh"
PW="$(./scripts/read-db-password-from-env.sh "$ENV_FILE")"

chmod +x "$ROOT_DIR/scripts/docker-compose.sh" 2>/dev/null || true
if [[ -x "$ROOT_DIR/scripts/docker-compose.sh" ]]; then
  node "$ROOT_DIR/scripts/prepare-compose-env.js"
  "$ROOT_DIR/scripts/docker-compose.sh" up -d postgres
else
  docker compose up -d postgres
fi
for i in $(seq 1 60); do
  docker exec "$CONTAINER" pg_isready -U postgres -d gizra_db >/dev/null 2>&1 && break
  [[ "$i" -eq 60 ]] && exit 1
  sleep 2
done
sleep 3

SQL_PASS="${PW//\'/\'\'}"
PGDATA="${PGDATA:-/var/lib/postgresql/data}"

apply_role_password() {
  docker exec -u postgres "$CONTAINER" psql -d postgres -v ON_ERROR_STOP=1 \
    -c "ALTER ROLE postgres WITH LOGIN SUPERUSER PASSWORD '${SQL_PASS}';"
}

# Single-user mode cannot run while postmaster is up (postmaster.pid lock).
repair_nologin_offline() {
  local vol image
  vol="$(docker inspect "$CONTAINER" --format '{{ range .Mounts }}{{ if eq .Destination "/var/lib/postgresql/data" }}{{ .Name }}{{ end }}{{ end }}')"
  if [[ -z "$vol" ]]; then
    echo "FAIL: could not find pgdata volume on $CONTAINER" >&2
    exit 1
  fi
  image="$(docker inspect "$CONTAINER" --format '{{.Config.Image}}')"
  local repair_sql
  repair_sql="$(mktemp)"
  printf "ALTER ROLE postgres WITH LOGIN SUPERUSER PASSWORD '%s';\n" "${SQL_PASS}" >"$repair_sql"
  echo "Stopping Postgres for offline NOLOGIN repair (volume ${vol})…"
  docker stop "$CONTAINER" >/dev/null
  docker run --rm -i -u postgres \
    -v "${vol}:/var/lib/postgresql/data" \
    "$image" \
    bash -c 'postgres --single -D /var/lib/postgresql/data template1' \
    <"$repair_sql" >/dev/null
  rm -f "$repair_sql"
  docker start "$CONTAINER" >/dev/null
  for i in $(seq 1 60); do
    docker exec "$CONTAINER" pg_isready -U postgres -d gizra_db >/dev/null 2>&1 && break
    [[ "$i" -eq 60 ]] && { echo "FAIL: Postgres did not become ready after offline repair."; exit 1; }
    sleep 2
  done
  sleep 2
}

if ! apply_role_password 2>/dev/null; then
  echo "Peer psql failed (often NOLOGIN from old repair scripts) — offline single-user repair…"
  repair_nologin_offline
  apply_role_password
fi
echo "OK: postgres role LOGIN + password synced from .env"

NET="$(docker inspect "$CONTAINER" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' | head -1)"
tcp_ok=0
if [[ -n "$NET" ]]; then
  for i in $(seq 1 15); do
    if docker run --rm --network "$NET" -e PGPASSWORD="$PW" postgres:16-alpine \
      psql -h postgres -U postgres -d gizra_db -v ON_ERROR_STOP=1 -c 'SELECT 1;' >/dev/null 2>&1; then
      tcp_ok=1
      echo "TCP password check OK."
      break
    fi
    sleep 2
  done
fi
if [[ "$tcp_ok" -ne 1 ]]; then
  echo "FAIL: TCP password check to postgres:5432 (Postgres may still be restarting or NOLOGIN)."
  exit 1
fi

if [[ -x "$ROOT_DIR/scripts/fix-postgres-grants.sh" ]]; then
  "$ROOT_DIR/scripts/fix-postgres-grants.sh"
fi
