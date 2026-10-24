#!/usr/bin/env node
/**
 * Add zones/restaurants.base_distance_km (required by current Prisma schema).
 * Uses DATABASE_URL from .env — for prod via SSH tunnel, point .env at 127.0.0.1:5434 first.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const sqlPath = path.join(__dirname, 'sql', 'add-base-distance-km.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(sql);
    const check = await client.query(`
      SELECT
        EXISTS(
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'restaurants' AND column_name = 'base_distance_km'
        ) AS restaurants_ok,
        EXISTS(
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'zones' AND column_name = 'base_distance_km'
        ) AS zones_ok
    `);
    const row = check.rows[0];
    if (!row.restaurants_ok || !row.zones_ok) {
      console.error('Patch ran but columns still missing:', row);
      process.exit(1);
    }
    console.log('OK: restaurants.base_distance_km and zones.base_distance_km exist.');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
