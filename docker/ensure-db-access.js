#!/usr/bin/env node
/**
 * Idempotent repair before Prisma starts (fixes P1010 on gizra_db.public after PG15+ / volume drift).
 * Requires DATABASE_URL with superuser postgres and a working password.
 */
const { Client } = require('pg');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('FATAL: DATABASE_URL is not set');
  process.exit(1);
}

function dbNameFromUrl(connectionString) {
  try {
    const u = new URL(connectionString.replace(/^postgresql:/i, 'http:'));
    const name = (u.pathname || '/gizra_db').replace(/^\//, '').split('/')[0];
    return name || 'gizra_db';
  } catch {
    return 'gizra_db';
  }
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

const DB = dbNameFromUrl(url);
const DB_IDENT = quoteIdent(DB);

const PUBLIC_GRANTS = `
ALTER SCHEMA public OWNER TO postgres;
GRANT USAGE, CREATE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO public;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
`;

async function withClient(connectionString, fn) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function postgresMaintenanceUrl(connectionString) {
  try {
    const u = new URL(connectionString.replace(/^postgresql:/i, 'http:'));
    u.pathname = '/postgres';
    return u.toString().replace(/^http:/i, 'postgresql:');
  } catch {
    return connectionString.replace(/\/[^/?]+(\?|$)/, '/postgres$1');
  }
}

async function repairGrants() {
  const adminUrl = postgresMaintenanceUrl(url);
  await withClient(adminUrl, async (client) => {
    await client.query(`ALTER DATABASE ${DB_IDENT} OWNER TO postgres`);
    await client.query(`GRANT CONNECT, CREATE, TEMPORARY ON DATABASE ${DB_IDENT} TO postgres`);
  });

  await withClient(url, async (client) => {
    await client.query(PUBLIC_GRANTS);
    await client.query('SELECT 1');
  });
}

function isDeniedPublic(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return /denied access on the database|P1010|permission denied for schema public/i.test(msg);
}

function isAuthFailure(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return /password authentication failed|P1000|no pg_hba|role .* does not exist/i.test(msg);
}

async function main() {
  try {
    await withClient(url, async (client) => {
      await client.query('SELECT 1');
    });
    console.log('Postgres OK (SELECT 1).');
    return;
  } catch (first) {
    if (isAuthFailure(first)) {
      console.error('FATAL: Postgres rejected password in DATABASE_URL.');
      console.error('On server run: unset DATABASE_URL POSTGRES_PASSWORD && ./scripts/ensure-postgres-password.sh');
      process.exit(1);
    }
    if (!isDeniedPublic(first)) {
      console.error('FATAL: Postgres check failed:', first.message || first);
      process.exit(1);
    }
    console.warn('[ensure-db-access] P1010 / public schema denied — applying GRANT repair…');
  }

  try {
    await repairGrants();
    console.log('Postgres OK after grant repair.');
  } catch (err) {
    console.error('FATAL: Grant repair failed:', err.message || err);
    console.error('On server run: ./scripts/ensure-postgres-password.sh && ./scripts/fix-postgres-grants.sh');
    process.exit(1);
  }
}

main();
