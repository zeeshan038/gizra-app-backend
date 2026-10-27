#!/usr/bin/env node
/**
 * Rewrite Mac-style .env hosts for production deploy (127.0.0.1:5434 → postgres:5432, local Redis → redis:6379).
 * Password and database name are preserved from DATABASE_URL.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const envPath = process.env.ENV_FILE
  ? path.isAbsolute(process.env.ENV_FILE)
    ? process.env.ENV_FILE
    : path.join(root, process.env.ENV_FILE)
  : path.join(root, '.env');

if (!fs.existsSync(envPath)) {
  console.error(`Missing ${envPath}`);
  process.exit(1);
}

const content = fs.readFileSync(envPath, 'utf8');
const lines = content.split(/\n/);
let changed = false;

function isLoopbackHost(host) {
  return host === '127.0.0.1' || host === 'localhost';
}

function fixDatabaseLine(line) {
  const m = line.match(/^DATABASE_URL=(.*)$/);
  if (!m) return line;
  const raw = m[1].trim().replace(/^["']|["']$/g, '').replace(/\r/g, '');
  let parsed;
  try {
    parsed = new URL(raw.replace(/^postgresql:/i, 'http:'));
  } catch {
    return line;
  }
  if (!isLoopbackHost(parsed.hostname)) return line;

  const user = decodeURIComponent(parsed.username || 'postgres');
  const pw = decodeURIComponent(parsed.password || '');
  if (!pw) {
    console.error('DATABASE_URL must include a password before normalize.');
    process.exit(1);
  }
  const db = (parsed.pathname || '/gizra_db').replace(/^\//, '').split('/')[0] || 'gizra_db';
  const params = new URLSearchParams(parsed.search);
  if (!params.has('schema')) params.set('schema', 'public');
  const query = params.toString();
  const passEnc = encodeURIComponent(pw);
  const fixed = `postgresql://${encodeURIComponent(user)}:${passEnc}@postgres:5432/${db}?${query}`;
  changed = true;
  console.log('Updated DATABASE_URL: loopback host → postgres:5432 (same password).');
  return `DATABASE_URL=${fixed}`;
}

function fixRedisLine(line) {
  if (!/^REDIS_URL=/.test(line)) return line;
  if (!/(127\.0\.0\.1|localhost)/.test(line)) return line;
  changed = true;
  console.log('Updated REDIS_URL: loopback → redis://redis:6379');
  return 'REDIS_URL=redis://redis:6379';
}

const out = lines.map((line) => {
  if (line.startsWith('DATABASE_URL=')) return fixDatabaseLine(line);
  if (line.startsWith('REDIS_URL=')) return fixRedisLine(line);
  return line;
});

if (changed) {
  fs.writeFileSync(envPath, out.join('\n').replace(/\n?$/, '\n'), 'utf8');
  console.log(`Wrote ${path.basename(envPath)} (server-ready hosts).`);
}
