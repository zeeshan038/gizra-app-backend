#!/usr/bin/env node
/**
 * node scripts/socket/vendor-token.js <email> <password>
 *
 * Prints JWT to stdout (use: export GIZRA_TOKEN=$(node scripts/socket/vendor-token.js ...))
 */
const { apiBase } = require('./config');

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  if (!email || !password) {
    console.error('Usage: node scripts/socket/vendor-token.js <email> <password>');
    process.exit(1);
  }

  const res = await fetch(`${apiBase()}/api/vendor/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok || !json.data?.token) {
    console.error(JSON.stringify(json, null, 2));
    process.exit(1);
  }
  process.stdout.write(json.data.token);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
