#!/usr/bin/env node
/**
 * Consumer review pending items — food_details.image must be a full CDN URL.
 *
 * Resolver only (no DB):
 *   npm run build && node scripts/test-consumer-review-food-image.js --resolve
 *
 * Local DB (loadPendingOrderReviews):
 *   node scripts/test-consumer-review-food-image.js --local 100603
 *
 * Live API:
 *   GIZRA_API_URL=https://backend-dev.gizra.app GIZRA_TOKEN=<jwt> \
 *     node scripts/test-consumer-review-food-image.js --api 100603
 *
 * Login + API:
 *   GIZRA_API_URL=https://backend-dev.gizra.app CONSUMER_PHONE=... CONSUMER_PASSWORD=... \
 *     node scripts/test-consumer-review-food-image.js --api 100603
 */
const path = require('path');

function parseArgs() {
  const api = process.argv.includes('--api');
  const resolveOnly = process.argv.includes('--resolve');
  const local = process.argv.includes('--local');
  const orderId = Number(
    process.argv
      .slice(2)
      .find((a) => !a.startsWith('--') && /^\d+$/.test(a)) || 100603
  );
  return { api, resolveOnly, local, orderId };
}

function isPublicUrl(s) {
  return typeof s === 'string' && /^https?:\/\//i.test(s.trim());
}

async function headStatus(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return res.status;
  } catch (e) {
    return `ERR ${e.message}`;
  }
}

async function checkDetails(details, label) {
  console.log(`\n=== ${label} ===\n`);
  if (!Array.isArray(details) || !details.length) {
    console.log('(no details rows — order already reviewed or not found)');
    return;
  }
  let bad = 0;
  for (const row of details) {
    const fd = row.food_details;
    const img = fd?.image;
    const imgFull = fd?.image_full_url;
    const ok = isPublicUrl(img) && (!imgFull || imgFull === img);
    if (!ok) bad += 1;
    const head = isPublicUrl(img) ? await headStatus(img) : '—';
    console.log(
      [
        `detail id=${row.id}`,
        `food_id=${row.food_id}`,
        ok ? 'image OK' : 'image BAD',
        `image=${img ?? 'null'}`,
        isPublicUrl(img) ? `HEAD ${head}` : '',
      ]
        .filter(Boolean)
        .join(' | ')
    );
  }
  if (bad) {
    console.error(`\n${bad} row(s) without https food_details.image`);
    process.exitCode = 1;
  } else {
    console.log('\nAll food_details.image values are public https URLs.');
  }
}

async function runResolve() {
  require(path.join(__dirname, '..', 'dist', 'loadEnv'));
  const { enrichFoodDetailsForReview } = require(path.join(
    __dirname,
    '..',
    'dist',
    'utils',
    'consumer',
    'reviewHelpers'
  ));
  const raw = JSON.stringify({
    id: 61,
    name: 'chesse pizza',
    price: 49,
    unit_food_price: 49,
    image: '2026-06-27-6a3fc643316c0.png',
    restaurant_id: 3,
  });
  const out = enrichFoodDetailsForReview(raw, null);
  console.log('enrichFoodDetailsForReview sample:\n', JSON.stringify(out, null, 2));
  if (!isPublicUrl(out?.image)) {
    process.exitCode = 1;
    return;
  }
  console.log('HEAD', await headStatus(out.image));
}

async function runLocal(orderId, userId) {
  require(path.join(__dirname, '..', 'dist', 'loadEnv'));
  const prisma = require(path.join(__dirname, '..', 'dist', 'config', 'database')).default;
  const { loadPendingOrderReviews } = require(path.join(
    __dirname,
    '..',
    'dist',
    'utils',
    'consumer',
    'reviewHelpers'
  ));

  let uid = userId;
  if (!uid) {
    const order = await prisma.orders.findFirst({
      where: { id: BigInt(orderId) },
      select: { user_id: true },
    });
    if (!order?.user_id) {
      console.error('Order not found or missing user_id:', orderId);
      process.exit(1);
    }
    uid = Number(order.user_id);
  }

  const payload = await loadPendingOrderReviews(orderId, uid);
  if (!payload) {
    console.error('loadPendingOrderReviews returned null');
    process.exit(1);
  }
  await checkDetails(payload.details, `Local loadPendingOrderReviews order=${orderId} user=${uid}`);
  await prisma.$disconnect();
}

async function consumerToken(base) {
  const fromEnv = process.env.GIZRA_TOKEN || process.env.TOKEN;
  if (fromEnv) return fromEnv;
  const phone = process.env.CONSUMER_PHONE;
  const password = process.env.CONSUMER_PASSWORD;
  if (!phone || !password) return null;
  const res = await fetch(`${base}/api/consumer/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      login_type: 'manual',
      field_type: 'phone',
      email_or_phone: phone,
      password,
    }),
  });
  const body = await res.json();
  if (!res.ok || !body?.data?.token) {
    console.error('Consumer login failed', res.status, body);
    process.exit(1);
  }
  console.log('Logged in consumer user', body?.data?.id ?? body?.data?.user?.id);
  return body.data.token;
}

async function runApi(orderId) {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  const { apiBase } = require('./socket/config');
  const base = apiBase();
  const jwt = await consumerToken(base);
  if (!jwt) {
    console.error('Set GIZRA_TOKEN or CONSUMER_PHONE + CONSUMER_PASSWORD for --api');
    process.exit(1);
  }
  const res = await fetch(`${base}/api/consumer/reviews/?order_id=${orderId}`, {
    headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/json' },
  });
  const body = await res.json();
  if (!res.ok) {
    console.error('API error', res.status, body);
    process.exit(1);
  }
  await checkDetails(body.details, `Live GET /consumer/reviews?order_id=${orderId}`);
}

async function main() {
  const { api, resolveOnly, local, orderId } = parseArgs();
  console.log('order_id:', orderId);
  if (resolveOnly) {
    await runResolve();
    return;
  }
  if (api) {
    await runApi(orderId);
    return;
  }
  if (local) {
    const userId = process.env.REVIEW_USER_ID ? Number(process.env.REVIEW_USER_ID) : undefined;
    await runLocal(orderId, userId);
    return;
  }
  console.error('Pass --resolve, --local, or --api');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
