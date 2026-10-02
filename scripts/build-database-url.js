/**
 * Build DATABASE_URL from POSTGRES_* in .env (single source of truth).
 * Docker Compose uses the same pieces inline; Mac dev uses this via npm run dev.
 */
require('dotenv').config();

function buildDatabaseUrl(overrides = {}) {
  const user = overrides.user || process.env.POSTGRES_USER || 'postgres';
  const password = overrides.password ?? process.env.POSTGRES_PASSWORD;
  const host = overrides.host || process.env.POSTGRES_HOST || '127.0.0.1';
  const port = overrides.port || process.env.POSTGRES_PORT || '5434';
  const db = overrides.db || process.env.POSTGRES_DB || 'gizra_db';
  const schema = overrides.schema || process.env.POSTGRES_SCHEMA || 'public';

  if (!password) {
    throw new Error('POSTGRES_PASSWORD is missing in .env');
  }

  const enc = encodeURIComponent(password);
  return `postgresql://${user}:${enc}@${host}:${port}/${db}?schema=${schema}`;
}

module.exports = { buildDatabaseUrl };

if (require.main === module) {
  try {
    process.stdout.write(buildDatabaseUrl());
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
