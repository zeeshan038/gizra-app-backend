#!/usr/bin/env node
/**
 * node scripts/socket/consumer-token.js <phone> <password>
 *
 * Manual login (login_type: manual). Prints JWT to stdout.
 * Uses GIZRA_API_URL or http://127.0.0.1:$PORT from .env (same as other scripts).
 */
require('dotenv').config();
const { apiBase } = require('./config');

async function main() {
  const phone = process.argv[2];
  const password = process.argv[3];
  if (!phone || !password) {
    console.error('Usage: node scripts/socket/consumer-token.js <phone> <password>');
    process.exit(1);
  }

  const base = apiBase();
  const res = await fetch(`${base}/api/consumer/login`, {
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
  const msg = e.message || String(e);
  if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED')) {
    console.error(
      `${msg}\nCannot reach API at ${apiBase()} — start npm run dev or set GIZRA_API_URL (e.g. http://127.0.0.1:3010).`
    );
  } else {
    console.error(msg);
  }
  process.exit(1);
});
