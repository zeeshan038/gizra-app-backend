#!/usr/bin/env bash
# One-shot setup script to instantiate gizra-dev on the VPS server.
# Run as root on 167.233.245.44:
#   cd /root/gizra-app-backend && bash scripts/setup-dev-server.sh
set -euo pipefail

DEV_DIR="/root/gizra-dev"
PROD_DIR="/root/gizra-app-backend"

echo "=========================================================="
echo " Setting up GIZRA-DEV Environment (Completely Isolated)"
echo "=========================================================="

if [[ ! -d "$PROD_DIR" ]]; then
  echo "FAIL: Expected prod directory $PROD_DIR does not exist!"
  exit 1
fi

# 1. Clone/update local git repo into DEV_DIR
if [[ -d "$DEV_DIR" ]]; then
  echo "Dev directory $DEV_DIR already exists."
  cd "$DEV_DIR"
  git fetch origin || true
else
  echo "Cloning repository into $DEV_DIR..."
  git clone "$PROD_DIR" "$DEV_DIR"
  cd "$DEV_DIR"
  git remote set-url origin https://github.com/zeeshan038/gizra-app-backend.git || true
fi

# 2. Check out branch (default to zeeshan-dev if exists, else main)
if git show-ref --verify --quiet refs/remotes/origin/zeeshan-dev; then
  git checkout zeeshan-dev || true
fi

# 3. Setup .env for dev
if [[ ! -f "$DEV_DIR/.env" ]]; then
  echo "Copying .env from production as base..."
  cp "$PROD_DIR/.env" "$DEV_DIR/.env"
  # Set NODE_ENV to development
  if grep -q '^NODE_ENV=' "$DEV_DIR/.env"; then
    sed -i -E 's/^NODE_ENV=.*/NODE_ENV=development/' "$DEV_DIR/.env"
  else
    echo "NODE_ENV=development" >> "$DEV_DIR/.env"
  fi
  echo "Created $DEV_DIR/.env with NODE_ENV=development."
fi

# 4. Make scripts executable
chmod +x "$DEV_DIR"/scripts/*.sh 2>/dev/null || true

# 5. Start dev postgres and redis containers
echo "Starting isolated Dev PostgreSQL and Redis containers..."
docker compose -f docker-compose.dev.yml up -d postgres redis

# 6. Clone production database into dev database
echo "Cloning production database into dev..."
bash scripts/clone-prod-db-to-dev.sh

# 7. Deploy Dev Backend
echo "Building and launching Dev Backend container..."
bash scripts/deploy-dev.sh

# 8. Configure Nginx for dev-backend.gizra.app
echo "Configuring Nginx reverse proxy for dev-backend.gizra.app..."
if [[ -d /etc/nginx/sites-available ]]; then
  cp "$DEV_DIR/nginx/dev-backend.gizra.app.conf" /etc/nginx/sites-available/dev-backend.gizra.app.conf
  ln -sf /etc/nginx/sites-available/dev-backend.gizra.app.conf /etc/nginx/sites-enabled/dev-backend.gizra.app.conf
  if nginx -t; then
    systemctl reload nginx
    echo "Nginx successfully configured and reloaded!"
  else
    echo "WARN: Nginx syntax test failed. Please check /etc/nginx/sites-available/dev-backend.gizra.app.conf"
  fi
fi

echo "=========================================================="
echo " GIZRA-DEV Setup Complete!"
echo " Ports:"
echo "   - Backend:  127.0.0.1:3003"
echo "   - Postgres: 127.0.0.1:5435"
echo "   - Redis:    127.0.0.1:6381"
echo ""
echo " Containers:"
echo "   - gizra-dev-backend"
echo "   - gizra-dev-postgres"
echo "   - gizra-dev-redis"
echo ""
echo " Next Steps:"
echo " 1. Ensure DNS A record for dev-backend.gizra.app points to 167.233.245.44"
echo " 2. Enable SSL: certbot --nginx -d dev-backend.gizra.app"
echo "=========================================================="
