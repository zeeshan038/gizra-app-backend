# Shell snippet: run inside gizra-backend container (docker exec … sh -c '…').
if [ -z "${DATABASE_URL:-}" ]; then
  echo "FAIL: DATABASE_URL is not set in the backend container."
  exit 1
fi
