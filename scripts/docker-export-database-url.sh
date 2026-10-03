# Shell snippet: run inside gizra-backend container (docker exec … sh -c '…').
# DATABASE_URL is set in entrypoint for the API process only; exec sessions need this export.
if [ -z "${POSTGRES_PASSWORD:-}" ]; then
  echo "FAIL: POSTGRES_PASSWORD is not set in the backend container env."
  echo "Add POSTGRES_PASSWORD=... to .env and: docker compose up -d --build --force-recreate backend"
  exit 1
fi
export DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/gizra_db?schema=public"
