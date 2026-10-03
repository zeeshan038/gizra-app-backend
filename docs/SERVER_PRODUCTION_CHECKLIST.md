# Server production (Hetzner)

**Same `DATABASE_URL` on Mac and server** (like Raidr): point at the server IP, port **5434**.

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@167.233.245.44:5434/gizra_db?schema=public
```

| | |
|--|--|
| Deploy | `git pull` → `unset DATABASE_URL POSTGRES_PASSWORD` → `npm run deploy:server` |
| Server `REDIS_URL` in compose | Overridden to `redis://redis:6379` |
| Mac `REDIS_URL` | `redis://localhost:6380` or `redis://167.233.245.44:6380` |

Ensure Hetzner firewall allows **5434** (and **6380** if Mac uses prod Redis) from your IP.
