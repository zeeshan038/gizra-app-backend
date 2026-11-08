#!/usr/bin/env node
/**
 * Verify driver My Orders history thumbnails (public URLs + optional HTTP HEAD).
 *
 * Local mapper (needs DATABASE_URL in .env):
 *   npm run build && node scripts/test-delivery-man-history-images.js 100595 100592
 *
 * Live API (driver JWT or login):
 *   GIZRA_API_URL=https://backend-dev.gizra.app GIZRA_TOKEN=<jwt> node scripts/test-delivery-man-history-images.js --api
 *   GIZRA_API_URL=https://backend-dev.gizra.app DM_PHONE=+972... DM_PASSWORD=... node scripts/test-delivery-man-history-images.js --api
 *
 * URL resolver only (no DB):
 *   node scripts/test-delivery-man-history-images.js --resolve
 */
const path = require('path');

function parseArgs() {
  const api = process.argv.includes('--api');
  const resolveOnly = process.argv.includes('--resolve');
  const ids = process.argv
    .slice(2)
    .filter((a) => a !== '--api' && a !== '--resolve')
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0);
  return {
    api,
    resolveOnly,
    orderIds: ids.length ? ids : [100603, 100595, 100592, 100591, 100590],
  };
}

async function runResolveSmoke() {
  require(path.join(__dirname, '..', 'dist', 'loadEnv'));
  const {
    resolveDriverOrderHistoryImage,
    resolveOrderListFoodImageUrl,
    resolveOrderListRestaurantLogoUrl,
  } = require(path.join(__dirname, '..', 'dist', 'utils', 'order', 'orderListImages'));

  const samples = [
    { name: '100603 pizza filename', food: '2026-06-27-6a3fc643316c0.png', logo: null },
    { name: '100592 logo only', food: null, logo: '2025-03-31-67eaf096d137b.png' },
    {
      name: '100595 AI snapshot',
      food: 'vendor/ai/foods/9d92cd5f8fa844df1c2afdbec7d8d252-1792945136004.png',
      logo: null,
    },
  ];
  console.log('CLOUDFLARE_PUBLIC_URL', process.env.CLOUDFLARE_PUBLIC_URL || '(unset)');
  for (const s of samples) {
    const url = resolveDriverOrderHistoryImage(s.food, s.logo);
    const head = url && isPublicUrl(url) ? await headStatus(url) : '—';
    console.log(`${s.name}\n  => ${url}\n  HEAD ${head}\n`);
  }
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

async function printRows(label, orders) {
  console.log(`\n=== ${label} (${orders.length} orders) ===\n`);
  let bad = 0;
  for (const row of orders) {
    const url = row.image;
    const urlOk = isPublicUrl(url);
    if (!urlOk) bad += 1;
    const head = urlOk ? await headStatus(url) : '—';
    console.log(
      [
        `#${row.id}`,
        `items=${row.item_count}`,
        row.item_name ? `"${row.item_name}"` : '(no name)',
        urlOk ? 'URL ok' : 'URL BAD (not https)',
        url ?? 'null',
        urlOk ? `HEAD ${head}` : '',
      ]
        .filter(Boolean)
        .join(' | ')
    );
  }
  if (bad) {
    console.error(`\n${bad} order(s) missing a public image URL.`);
    process.exitCode = 1;
  } else {
    console.log('\nAll listed orders have https image URLs.');
  }
}

async function runLocal(orderIds) {
  require(path.join(__dirname, '..', 'dist', 'loadEnv'));
  const prisma = require(path.join(__dirname, '..', 'dist', 'config', 'database')).default;
  const { mapMyOrdersForDeliveryMan } = require(path.join(
    __dirname,
    '..',
    'dist',
    'utils',
    'deliveryman',
    'myOrdersHelpers'
  ));

  const orders = await prisma.orders.findMany({
    where: { id: { in: orderIds.map((id) => BigInt(id)) } },
    orderBy: { id: 'desc' },
  });
  if (!orders.length) {
    console.error('No orders found in DB for ids:', orderIds.join(', '));
    process.exit(1);
  }
  const list = await mapMyOrdersForDeliveryMan(orders);
  await printRows('Local mapper (mapMyOrdersForDeliveryMan)', list);
  await prisma.$disconnect();
}

async function driverToken(base) {
  const fromEnv = process.env.GIZRA_TOKEN || process.env.TOKEN;
  if (fromEnv) return fromEnv;
  const phone = process.env.DM_PHONE;
  const password = process.env.DM_PASSWORD;
  if (!phone || !password) return null;
  const res = await fetch(`${base}/api/delivery-man/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ phone, password, remember_me: true }),
  });
  const body = await res.json();
  const t = body?.data?.token;
  if (!res.ok || !t) {
    console.error('Driver login failed', res.status, body);
    process.exit(1);
  }
  console.log('Logged in driver id', body?.data?.id);
  return t;
}

async function runApi() {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  const { apiBase } = require('./socket/config');
  const base = apiBase();
  const jwt = await driverToken(base);
  if (!jwt) {
    console.error('Set GIZRA_TOKEN or DM_PHONE + DM_PASSWORD for --api mode.');
    process.exit(1);
  }
  const res = await fetch(`${base}/api/delivery-man/orders/history?limit=50&offset=1`, {
    headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/json' },
  });
  const body = await res.json();
  if (!res.ok || !body?.data?.orders) {
    console.error('API error', res.status, body);
    process.exit(1);
  }
  const wanted = new Set(parseArgs().orderIds.map(String));
  const subset = body.data.orders.filter((o) => wanted.has(String(o.id)));
  const rows = subset.length ? subset : body.data.orders.slice(0, 8);
  await printRows(`Live API ${base}/api/delivery-man/orders/history`, rows);
}

async function main() {
  const { api, resolveOnly, orderIds } = parseArgs();
  if (resolveOnly) {
    await runResolveSmoke();
    return;
  }
  console.log('Order ids:', orderIds.join(', '));
  if (api) await runApi();
  else await runLocal(orderIds);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
