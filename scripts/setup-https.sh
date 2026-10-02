#!/usr/bin/env bash
# Run on the production server as root from the gizra-backend / gizra-app-backend folder.
set -euo pipefail

DOMAIN="${1:-backend-prod.gizra.app}"
EMAIL="${2:-admin@gizra.app}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NGINX_SRC="${ROOT_DIR}/nginx/${DOMAIN}.conf"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root."
  exit 1
fi

if [[ ! -f "$NGINX_SRC" ]]; then
  echo "Missing nginx config: $NGINX_SRC"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx certbot python3-certbot-nginx

cp "$NGINX_SRC" "/etc/nginx/sites-available/${DOMAIN}"
ln -sfn "/etc/nginx/sites-available/${DOMAIN}" "/etc/nginx/sites-enabled/${DOMAIN}"
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable --now nginx
systemctl reload nginx

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp
  ufw allow 443/tcp
fi

certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect

echo
echo "HTTPS is live: https://${DOMAIN}/swagger/"
echo "API base:      https://${DOMAIN}/api"
