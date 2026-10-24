#!/usr/bin/env bash
# Upload Laravel storage/app/public → Cloudflare R2 (prod bucket in .env).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

DEFAULT_LEGACY="${GIZRA_LEGACY_STORAGE:-$ROOT_DIR/../Gizra_full_backup_2026-08-19/deliverymain/storage/app/public}"
export LEGACY_STORAGE_ROOT="${LEGACY_STORAGE_ROOT:-$DEFAULT_LEGACY}"

if [[ ! -d "$LEGACY_STORAGE_ROOT" ]]; then
  echo "Missing legacy files: $LEGACY_STORAGE_ROOT"
  echo "Set LEGACY_STORAGE_ROOT to your PHP storage/app/public folder."
  exit 1
fi

for v in CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_ACCESS_KEY_ID CLOUDFLARE_SECRET_ACCESS_KEY CLOUDFLARE_BUCKET_NAME CLOUDFLARE_PUBLIC_URL; do
  if ! grep -qE "^${v}=.+" "$ROOT_DIR/.env" 2>/dev/null; then
    echo "Missing $v in .env (R2 credentials required)."
    exit 1
  fi
done

echo "LEGACY_STORAGE_ROOT=$LEGACY_STORAGE_ROOT"
exec npm run db:migrate-media-to-r2 -- "$@"
