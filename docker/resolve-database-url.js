#!/usr/bin/env node
/** Force Docker-internal host postgres:5432; keep user, password, db from compose env (Raidr-style). */
const raw =
  process.env.GIZRA_DATABASE_URL_INTERNAL ||
  process.env.DATABASE_URL ||
  '';
if (!raw) {
  console.error('No DATABASE_URL / GIZRA_DATABASE_URL_INTERNAL');
  process.exit(1);
}
const line = raw.replace(/\r/g, '').trim();
let u;
try {
  u = new URL(line.replace(/^postgresql:/i, 'http:'));
} catch {
  console.error('Invalid database URL');
  process.exit(1);
}
u.hostname = 'postgres';
u.port = '5432';
const user = u.username || 'postgres';
const pass = u.password || '';
const db = (u.pathname || '/gizra_db').replace(/^\//, '').split('/')[0] || 'gizra_db';
const search = u.search && u.search.length > 1 ? u.search : '?schema=public';
const userEnc = encodeURIComponent(decodeURIComponent(user));
if (!pass) {
  console.error('FATAL: DATABASE_URL must include a password for stable Docker auth');
  process.exit(1);
}
const passEnc = encodeURIComponent(decodeURIComponent(pass));
process.stdout.write(`postgresql://${userEnc}:${passEnc}@postgres:5432/${db}${search}`);
