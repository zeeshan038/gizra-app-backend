#!/usr/bin/env node
/**
 * Smoke test: consumer Places proxy (uses backend GOOGLE_MAPS_API_KEY).
 *
 * Usage:
 *   node scripts/test-consumer-places-api.js
 *   GIZRA_API_URL=http://127.0.0.1:3000 SEARCH=Tel%20Aviv node scripts/test-consumer-places-api.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { apiBase } = require('./socket/config');

const base = (process.env.GIZRA_API_URL || apiBase()).replace(/\/$/, '');
const search = process.env.SEARCH || 'Jerusalem';

async function get(path) {
  const res = await fetch(`${base}/api${path}`, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 400);
  }
  return { status: res.status, body };
}

async function main() {
  console.log('API base:', `${base}/api`);
  const auto = await get(
    `/consumer/config/place-autocomplete?search_text=${encodeURIComponent(search)}`
  );
  console.log('\nplace-autocomplete:', auto.status, auto.body?.status ?? auto.body);

  const predictions = auto.body?.predictions;
  if (!Array.isArray(predictions) || !predictions.length) {
    if (auto.body?.error_message) console.error('Google:', auto.body.error_message);
    console.error('No predictions — set GOOGLE_MAPS_API_KEY in backend .env and enable Places/Geocoding APIs.');
    process.exitCode = 1;
    return;
  }

  const placeId = predictions[0].place_id;
  console.log('First prediction:', predictions[0].description);

  const details = await get(`/consumer/config/place-details?placeid=${encodeURIComponent(placeId)}`);
  console.log('\nplace-details:', details.status, details.body?.status ?? details.body);
  const loc = details.body?.result?.geometry?.location;
  if (loc) {
    const geo = await get(`/consumer/config/geocode?lat=${loc.lat}&lng=${loc.lng}`);
    console.log('\ngeocode:', geo.status, geo.body?.status ?? geo.body);
  }

  console.log('\nDone — share docs/CONSUMER_PLACES_API.md with Flutter.');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
