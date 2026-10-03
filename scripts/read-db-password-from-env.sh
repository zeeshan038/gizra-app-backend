#!/usr/bin/env bash
# Print postgres password from DATABASE_URL in .env (for one-time DB sync scripts).
set -euo pipefail
ENV_FILE="${1:-.env}"
line="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//;s/["'\'']$//')"
if [[ -z "$line" ]]; then
  echo "No DATABASE_URL in $ENV_FILE" >&2
  exit 1
fi
node -e "
const u = process.argv[1];
const m = u.match(/^postgresql:\\/\\/([^:\\/]+):([^@]+)@/);
if (!m) { console.error('Invalid DATABASE_URL'); process.exit(1); }
console.log(decodeURIComponent(m[2]));
" "$line"
