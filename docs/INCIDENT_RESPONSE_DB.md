# Database incident response (suspected compromise)

Treat **P1010**, interrupted shutdown recovery, and **COPY … FROM PROGRAM** / shell download attempts in Postgres logs as **possible intrusion**, not only a GRANT issue.

## Contain (in order)

1. **Stop API only** (keep Postgres running; do not delete the volume):
   ```bash
   docker stop gizra-backend
   ```
2. **Block public TCP 5434** (and **6380** if exposed) in the **Hetzner Cloud Firewall** and verify host `ufw`/iptables. Postgres should be reachable only on the Docker network (`postgres:5432` from the backend container) or via **SSH tunnel** to `127.0.0.1:5434`.
3. **Rotate exposed secrets** from a trusted machine (API keys, JWT, Cloudflare, etc.). **Do not** change the Postgres password until you know which roles exist and you have a **forensic backup** (below).

## Preserve evidence before repair

```bash
# Postgres logs (adjust time window)
docker logs gizra-postgres > /root/forensics/gizra-postgres-$(date +%F).log 2>&1

# Volume name for provider snapshot
docker volume inspect gizra-app-backend_pgdata --format '{{ .Name }}'

# Logical backup (read-only; does not stop Postgres)
mkdir -p /root/forensics
docker exec gizra-postgres pg_dump -U postgres -Fc gizra_db \
  > /root/forensics/gizra_db-pre-remediation-$(date +%F-%H%M).dump
```

Copy the dump and logs **off the VPS** before password changes or `deploy:server`.

## Recovery decision

- **Clean backup from before suspicious log timestamps** → restore to a **new** VPS or new volume; rotate all secrets; do not “repair in place” on a suspected root compromise.
- **No trustworthy backup** → assume data and OS may be untrusted; export what you need from the forensic dump, rebuild from scratch, audit extensions/roles (`\du`, `\dx` in psql).

## After containment (not during first response)

- Bind Postgres/Redis to loopback only (`127.0.0.1:5434` in `docker-compose.yml`); Mac access via `scripts/mac-db-tunnel.sh`.
- Re-enable API only after firewall + role review + restore plan.
