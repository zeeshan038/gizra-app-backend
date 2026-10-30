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
Category images (prod): backfill-category-images-server.sh (--apply), after git pull + deploy
Variation pricing (dev/prod): backfill-variation-additive-server.sh (--apply) — run via Docker, not host npm
MySQL → Postgres: docs/MYSQL_TO_POSTGRES_MIGRATION.md, migrate-on-server.sh (VPS),
  migrateMysqlToPostgres.ts, mac-mysql-tunnel.sh, mysql-docker-import.sh
