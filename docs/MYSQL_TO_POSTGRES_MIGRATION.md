# MySQL (PHP prod) → PostgreSQL migration

Legacy PHP uses **MySQL** `gizra_db`. The Node backend uses **PostgreSQL** `gizra_db` (same name, different server/engine).

## Recommended: run on the VPS (no Mac SSH tunnel)

If you can open **Hetzner console** or `ssh root@gizra-v2`, run migration **on the server** next to Docker Postgres (`127.0.0.1:5434`).

**Check first — is MySQL on this machine?**

```bash
ss -tlnp | grep 3306 || echo "nothing listening on 3306"
docker ps --format '{{.Names}}' | grep -iE 'mysql|maria' || true
```

If `mysql: command not found`, install only a **client** (does not install a server):

```bash
apt update && apt install -y mariadb-client
mysql -h 127.0.0.1 -u root -e "SELECT COUNT(*) FROM gizra_db.users;"
```

- **Connects** → use `./scripts/migrate-on-server.sh` with default `MYSQL_MIGRATION_URL=mysql://root@127.0.0.1:3306/gizra_db`.
- **Connection refused / no 3306** → **PHP prod MySQL is on another host** (shared hosting, old VPS). Hetzner `gizra-v2` is Postgres-only today. Use **“Import dump on VPS”** below, then `migrate-on-server.sh`.

### Import dump on VPS (PHP MySQL elsewhere)

On the **PHP / hosting** panel or SSH, create a dump:

```bash
mysqldump -u root --single-transaction --routines --triggers \
  --default-character-set=utf8mb4 gizra_db > gizra_mysql_prod.sql
```

Copy to Hetzner (`scp gizra_mysql_prod.sql root@167.233.245.44:/root/`), then on **gizra-v2**:

```bash
cd ~/gizra-app-backend
chmod +x scripts/mysql-docker-import.sh
./scripts/mysql-docker-import.sh /root/gizra_mysql_prod.sql
export MYSQL_MIGRATION_URL='mysql://root:migrate_local_root@127.0.0.1:3306/gizra_db'
./scripts/migrate-on-server.sh
./scripts/migrate-on-server.sh --apply --truncate --confirm
```

(Docker MariaDB listens on **3306** on the host; see script output.)

1. **Push** migration scripts (this repo) and on the server:

   ```bash
   cd ~/gizra-app-backend
   git pull origin zeeshan-dev   # or your branch
   chmod +x scripts/migrate-on-server.sh
   ```

2. **Rebuild** backend image (includes `mysql2` + migration scripts):

   ```bash
   unset DATABASE_URL POSTGRES_PASSWORD
   npm run deploy:server
   ```

3. **Backup** Postgres:

   ```bash
   docker exec gizra-postgres pg_dump -U postgres -Fc gizra_db \
     > /root/gizra_pg_backup_$(date +%F).dump
   ```

   *(Note the space: `-U postgres -Fc`, not `postgres-Fc`.)*

4. **Dry run** (row counts):

   ```bash
   ./scripts/migrate-on-server.sh
   ```

   If MySQL is not on the VPS, import a PHP dump first (see “Import dump on VPS” above).

5. **Load** (maintenance window — truncates Postgres):

   ```bash
   ./scripts/migrate-on-server.sh --apply --truncate --confirm
   ```

   Then sequences + Cloudflare folders:

   ```bash
   PW="$(./scripts/read-db-password-from-env.sh .env)"
   export DATABASE_URL="postgresql://postgres:${PW}@127.0.0.1:5434/gizra_db?schema=public"
   bash scripts/docker-compose.sh run --rm -T --network host -e DATABASE_URL backend \
     node ./node_modules/ts-node/dist/bin.js scripts/resetPgSequences.ts
   docker exec gizra-backend npx ts-node scripts/backfillCloudflareIds.ts
   ```

**MySQL must be on this VPS** (or set `MYSQL_MIGRATION_URL` to a host you can reach from the server). If PHP/MySQL lives on **another** machine, take a `mysqldump` there and import on the VPS, or use the Mac tunnel path below.

---

## 1. Backups

**MySQL (on PHP server):**

```bash
mysqldump -u root -p --single-transaction --routines --triggers \
  --default-character-set=utf8mb4 gizra_db > gizra_mysql_prod_$(date +%F).sql
```

**Postgres (Hetzner — from Mac with tunnel):**

```bash
./scripts/mac-db-tunnel.sh   # terminal 1
pg_dump -Fc -h 127.0.0.1 -p 5434 -U postgres gizra_db -f gizra_pg_backup_$(date +%F).dump
```

## 2. Connect from your Mac

**Terminal A — Postgres (prod):**

```bash
cd gizra-backend && ./scripts/mac-db-tunnel.sh
```

**Terminal B — MySQL (PHP prod on VPS):**

```bash
cd gizra-backend && ./scripts/mac-mysql-tunnel.sh
```

**`.env` (Mac):**

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@127.0.0.1:5434/gizra_db?schema=public
MYSQL_MIGRATION_URL=mysql://root:YOUR_MYSQL_PASSWORD@127.0.0.1:3307/gizra_db
```

*(Use port `3307` when using `mac-mysql-tunnel.sh`; adjust user/password to match PHP `.env`.)*

**Alternative — local Docker MySQL from a dump file:**

```bash
chmod +x scripts/mysql-docker-import.sh
./scripts/mysql-docker-import.sh /path/to/gizra_mysql_prod.sql
# then MYSQL_MIGRATION_URL=mysql://root:migrate_local_root@127.0.0.1:3306/gizra_db
```

## 3. Compare (dry run)

```bash
cd gizra-backend
npm run db:migrate-from-mysql
```

Shows row counts per table (MySQL vs Postgres).

## 4. Load (maintenance window)

**This truncates all public Postgres tables and reloads from MySQL.**

```bash
npm run db:migrate-from-mysql -- --apply --truncate --confirm
npm run db:migrate-reset-sequences
npx ts-node scripts/backfillCloudflareIds.ts
```

Pg-only columns (`cloudflareId`, `is_notification_on`, …) keep defaults / `NULL`.

## 5. Smoke tests

- Customer / vendor / driver login (PHP `$2y$` passwords work on Node).
- Zone list / restaurant discover.
- Open an old order by id.

## 6. Not migrated by this script

- **Media files** (Laravel `storage/` / old URLs) — separate R2 copy if needed.
- **Redis** — ignore.

## Cutover

1. PHP maintenance mode (stop writes).
2. Final `mysqldump`.
3. Reload MySQL tunnel or re-import dump to local Docker MySQL.
4. Run step 4 again.
5. Point all apps at `https://backend-prod.gizra.app/api` (already true for admin/restaurant panels).
