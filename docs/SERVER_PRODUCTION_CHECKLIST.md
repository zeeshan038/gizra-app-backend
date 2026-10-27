# Server production (Hetzner)

**Mac → prod DB:** SSH tunnel only (Postgres is **not** on the public internet).

```bash
./scripts/mac-db-tunnel.sh   # Mac localhost:5434 → VPS 127.0.0.1:5434
```

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@127.0.0.1:5434/gizra_db?schema=public
```

| | |
|--|--|
| Deploy | `git pull` → `unset DATABASE_URL POSTGRES_PASSWORD` → `npm run deploy:server` |
| Server `REDIS_URL` in compose | Overridden to `redis://redis:6379` |
| Mac `REDIS_URL` | `redis://127.0.0.1:6380` via the same SSH session if needed |

**Do not** publish Postgres/Redis on `0.0.0.0`. Block **5434** and **6380** inbound at the provider firewall. See `docs/INCIDENT_RESPONSE_DB.md` if logs suggest abuse.
