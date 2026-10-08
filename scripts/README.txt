Production (server ~/gizra-app-backend)
  npm run deploy:server     — only routine deploy (preflight → compose → verify)
  npm run reset:prod-docker — wipe volumes + deploy + prisma db push (data loss)
  npm run fix:prod-db       — health red: quick backend restart, else deploy
  npm run compose           — docker compose with .env.compose

Core scripts (do not duplicate):
  deploy-server.sh, preflight-server-env.sh, prepare-compose-env.js,
  docker-compose.sh, ensure-postgres-password.sh, read-db-password-from-env.sh,
  verify-db-docker.sh

Mac dev:
  env.mac.example, mac-db-tunnel.sh, mac-redis-local.sh

Seeds / ops: createAdmin.ts, enablePostgis.ts, seed*.ts, approve*.ts, socket/*
