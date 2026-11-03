#!/usr/bin/env node
/**
 * Smoke test: GET /api/consumer/restaurants/reviews
 *
 * Usage:
 *   node scripts/test-restaurant-reviews-api.js [restaurant_id] [base_url]
 *
 * Base URL defaults to http://127.0.0.1:$PORT from .env (usually 3000).
 * If you see "Cannot GET /api/consumer/restaurants/reviews", the process on that
 * port is an old build — set GIZRA_API_URL to the ts-node-dev server you started.
 *
 * With auth (real phone + password; never use the literal text YOUR_PHONE):
 *   GIZRA_API_URL=http://127.0.0.1:3010 \
 *   GIZRA_TOKEN="$(GIZRA_API_URL=http://127.0.0.1:3010 node scripts/socket/consumer-token.js +972501234567 secret)" \
 *   node scripts/test-restaurant-reviews-api.js 3
 *
 * Or inline login via env (same base URL as the test):
 *   GIZRA_API_URL=http://127.0.0.1:3010 CONSUMER_PHONE=+972... CONSUMER_PASSWORD=secret \
 *   node scripts/test-restaurant-reviews-api.js 3
 */
require('dotenv').config();
const { apiBase } = require('./socket/config');

const restaurantId = process.argv[2] || '3';
const base = (process.argv[3] || process.env.GIZRA_API_URL || apiBase()).replace(/\/$/, '');

async function resolveToken() {
  const existing = process.env.GIZRA_TOKEN || process.env.TOKEN;
  if (existing?.trim()) return existing.trim();

  const phone = process.env.CONSUMER_PHONE?.trim();
  const password = process.env.CONSUMER_PASSWORD;
  if (!phone || !password) return '';

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
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.data?.token) {
    console.error('Login failed for step 6:', JSON.stringify(json, null, 2));
    return '';
  }
  return json.data.token;
}

function hintIfHtml404(label, result) {
  if (
    result.status === 404 &&
    typeof result.body === 'string' &&
    result.body.includes('Cannot GET /api/consumer')
  ) {
    console.error(
      `\n[${label}] Got Express HTML 404 — wrong server or code not deployed on ${base}.`,
      'Use GIZRA_API_URL pointing at gizra-backend (npm run dev), not port 3002.\n'
    );
  }
}

async function get(path, auth) {
  const headers = { Accept: 'application/json' };
  if (auth) headers.Authorization = `Bearer ${auth}`;
  const res = await fetch(`${base}${path}`, { headers });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 500);
  }
  return { status: res.status, body };
}

async function main() {
  const token = await resolveToken();
  console.log(`Base URL: ${base}`);
  console.log(`Restaurant id: ${restaurantId}`);
  console.log(`Auth: ${token ? 'Bearer token set' : 'none (public)'}\n`);

  const missing = await get('/api/consumer/restaurants/reviews');
  hintIfHtml404('missing restaurant_id', missing);
  console.log('1) Missing restaurant_id →', missing.status, JSON.stringify(missing.body));

  const notFound = await get('/api/consumer/restaurants/reviews?restaurant_id=999999999');
  console.log('2) Unknown restaurant →', notFound.status, JSON.stringify(notFound.body));

  const pub = await get(`/api/consumer/restaurants/reviews?restaurant_id=${restaurantId}`);
  hintIfHtml404('public reviews', pub);
  console.log('3) Public reviews →', pub.status);
  console.log(JSON.stringify(pub.body, null, 2));

  const legacy = await get(
    `/api/consumer/restaurants/reviews?restaurant_id=${restaurantId}&legacy=1`
  );
  console.log('4) Legacy array →', legacy.status, Array.isArray(legacy.body) ? `array(len=${legacy.body.length})` : legacy.body);

  const details = await get(`/api/consumer/restaurants/${restaurantId}`, token || undefined);
  console.log('5) Restaurant details →', details.status);
  if (details.body?.data) {
    const d = details.body.data;
    console.log(
      JSON.stringify(
        {
          id: d.id,
          name: d.name,
          avg_rating: d.avg_rating,
          rating_count: d.rating_count,
          reviews_section: d.reviews_section,
          can_write_review: d.can_write_review,
          pending_order_id: d.pending_order_id,
        },
        null,
        2
      )
    );
  } else {
    console.log(JSON.stringify(details.body, null, 2));
  }

  if (token) {
    const authed = await get(`/api/consumer/restaurants/reviews?restaurant_id=${restaurantId}`, token);
    console.log('6) Authed reviews →', authed.status);
    console.log(
      JSON.stringify(
        {
          can_write_review: authed.body?.can_write_review,
          pending_order_id: authed.body?.pending_order_id,
          review_count: authed.body?.reviews?.length,
        },
        null,
        2
      )
    );
  } else {
    console.log(
      '6) Authed reviews → skipped (no token). Use real credentials; token script must use the same GIZRA_API_URL as this test.'
    );
  }

  const failed = [missing, notFound, pub, details].some((r) => r.status >= 500);
  if (failed || pub.status !== 200) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
