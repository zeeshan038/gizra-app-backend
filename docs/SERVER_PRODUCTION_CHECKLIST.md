# Gizra backend — Hetzner production checklist

## Golden rules (avoid P1000 forever)

| Where | What to set |
|-------|-------------|
| **Server `.env`** | `POSTGRES_PASSWORD=one_password_only` |
| **Server `.env`** | `DATABASE_URL=...@127.0.0.1:5434/...` **optional** — for `psql` / Prisma on the SSH host; run `./scripts/sync-database-url-env.sh` |
| **API container** | Always `@postgres:5432` from `docker-compose.yml` (overrides `.env` `DATABASE_URL`; entrypoint rejects localhost **inside** the container) |
| **Mac `.env`** | `DATABASE_URL=postgresql://postgres:SAME_PASSWORD@127.0.0.1:5434/gizra_db?schema=public` + SSH tunnel |
| **Never** | Change `POSTGRES_PASSWORD` without either fresh volume **or** `scripts/sync-postgres-password.sh` |

## After wiping Postgres volume (fresh `gizra_db`)

```bash
cd ~/gizra-app-backend
# .env must include POSTGRES_PASSWORD=mysecretpassword (match Mac local URL password)
git pull origin zeeshan-dev
chmod +x scripts/bootstrap-production.sh
./scripts/bootstrap-production.sh
```

## Verify anytime

```bash
./scripts/verify-db-docker.sh
docker compose ps   # gizra-backend = Up, not Restarting
```

## URLs

| Context | Connection string |
|---------|-------------------|
| API in Docker | `@postgres:5432` (automatic) |
| psql on server host | `@127.0.0.1:5434` |
| Mac via tunnel | `@127.0.0.1:5434` |

## Databases on this server

- `gizra-app-backend_pgdata` → Gizra (`gizra_db`)
- `jikanzo-development_pgdata` → separate project (do not delete unless intended)
