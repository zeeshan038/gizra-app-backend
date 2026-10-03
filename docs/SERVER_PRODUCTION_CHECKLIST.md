# Server production (Hetzner)

Same mental model as your other backends: **one `DATABASE_URL` in `.env`**, then deploy.

| Where | `DATABASE_URL` host |
|--------|---------------------|
| **Server Docker** | `postgres:5432` (compose service name) |
| **Mac `npm run dev`** | `127.0.0.1:5434` (SSH tunnel to server) |

| Do | Don't |
|----|--------|
| `git pull` + `npm run deploy:server` | Copy Mac `.env` with `127.0.0.1` or server public IP as DB host |
| Keep password in `DATABASE_URL` stable | Change password in `.env` without `npm run repair:prod-stack` once |
| `docker compose up -d` after reboot | `docker compose down` unless you mean full outage |

## First-time / template

```bash
cp env.server.example .env
# edit DATABASE_URL password once
npm run deploy:server
```

## If login returns P1000 (once)

Password inside the Postgres volume ≠ password in `DATABASE_URL`:

```bash
npm run repair:prod-stack
```
