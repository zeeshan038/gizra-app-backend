#!/usr/bin/env node
/**
 * node scripts/socket/consumer-token.js <phone> <password>
 *
 * Manual login (login_type: manual). Prints JWT to stdout.
 */
const { apiBase } = require('./config');

async function main() {
  const phone = process.argv[2];
  const password = process.argv[3];
  if (!phone || !password) {
    console.error('Usage: node scripts/socket/consumer-token.js <phone> <password>');
    process.exit(1);
  }

  const res = await fetch(`${apiBase()}/api/consumer/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      login_type: 'manual',
      field_type: 'phone',
      email_or_phone: phone,
      password,
    }),
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
