#!/usr/bin/env node
/**
 * Smoke test: customer coupon visibility (admin + vendor).
 *
 * Usage:
 *   node scripts/test-consumer-coupons-api.js
 *   COUPON_CODE=016M57RH ZONE_ID=1 node scripts/test-consumer-coupons-api.js
 *   RESTAURANT_ID=3 node scripts/test-consumer-coupons-api.js
 *
 * Auth (required for GET /api/consumer/coupon/list):
 *   GIZRA_TOKEN=... node scripts/test-consumer-coupons-api.js
 *   CONSUMER_PHONE=+972... CONSUMER_PASSWORD=secret node scripts/test-consumer-coupons-api.js
 *
 * Optional: GIZRA_API_URL=http://127.0.0.1:3000
 */
require('dotenv').config();
const { apiBase } = require('./socket/config');

const couponCode = (process.env.COUPON_CODE || '016M57RH').trim();
const zoneId = process.env.ZONE_ID ? Number(process.env.ZONE_ID) : null;
const restaurantId = process.env.RESTAURANT_ID ? Number(process.env.RESTAURANT_ID) : null;
const base = (process.env.GIZRA_API_URL || apiBase()).replace(/\/$/, '');

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
    console.error('Login failed:', JSON.stringify(json, null, 2));
    return '';
  }
  return json.data.token;
}

async function resolveRestaurantIdForTest(dbCoupon, zones, explicitId) {
  if (explicitId != null && Number.isFinite(explicitId)) return explicitId;
  if (!dbCoupon) return null;
  if (dbCoupon.coupon_type === 'restaurant_wise') {
    try {
      const ids = JSON.parse(dbCoupon.data || '[]');
      return Array.isArray(ids) && ids.length ? Number(ids[0]) : null;
    } catch {
      return null;
    }
  }
  if (dbCoupon.coupon_type === 'zone_wise' && zones.length) {
    try {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      const row = await prisma.restaurants.findFirst({
        where: { status: true, zone_id: { in: zones } },
        select: { id: true },
        orderBy: { id: 'asc' },
      });
      await prisma.$disconnect();
      return row ? Number(row.id) : null;
    } catch {
      return null;
    }
  }
  return null;
}

async function loadCouponFromDb() {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const row = await prisma.coupons.findFirst({ where: { code: couponCode } });
    await prisma.$disconnect();
    return row;
  } catch (e) {
    console.warn('DB lookup skipped:', e.message || e);
    return null;
  }
}

function parseZoneIdsFromCouponData(coupon) {
  if (!coupon || coupon.coupon_type !== 'zone_wise') return [];
  try {
    const parsed = JSON.parse(coupon.data || '[]');
    return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : [];
  } catch {
    return [];
  }
}

function couponInList(list, code) {
  if (!Array.isArray(list)) return false;
  return list.some((c) => String(c?.code || '').toUpperCase() === code.toUpperCase());
}

async function get(path, { token, zoneIds, extraHeaders } = {}) {
  const headers = { Accept: 'application/json', ...(extraHeaders || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (zoneIds?.length) {
    headers.zoneId = JSON.stringify(zoneIds);
    headers.zoneid = JSON.stringify(zoneIds);
  }
  const res = await fetch(`${base}${path}`, { headers });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 800);
  }
  return { status: res.status, body };
}

async function main() {
  const token = await resolveToken();
  const dbCoupon = await loadCouponFromDb();

  const zones =
    zoneId != null && Number.isFinite(zoneId)
      ? [zoneId]
      : parseZoneIdsFromCouponData(dbCoupon);

  console.log('=== Customer coupon API test ===');
  console.log('Base URL:', base);
  console.log('Looking for coupon code:', couponCode);
  if (dbCoupon) {
    console.log('DB coupon:', {
      id: String(dbCoupon.id),
      title: dbCoupon.title,
      coupon_type: dbCoupon.coupon_type,
      status: dbCoupon.status,
      start_date: dbCoupon.start_date,
      expire_date: dbCoupon.expire_date,
      created_by: dbCoupon.created_by,
      data: dbCoupon.data,
      customer_id: dbCoupon.customer_id,
    });
  } else {
    console.log('DB coupon: not found (set DATABASE_URL or create coupon on this DB)');
  }
  console.log('Zone id(s) for request:', zones.length ? zones : '(none — set ZONE_ID or use zone_wise coupon in DB)');
  console.log('Auth:', token ? 'Bearer token' : 'MISSING — list endpoint will 401');
  console.log('');

  let exitCode = 0;
  let foundAnywhere = false;

  if (!token) {
    console.log('1) GET /consumer/coupon/list → skipped (no token; set GIZRA_TOKEN or CONSUMER_PHONE + CONSUMER_PASSWORD)');
  } else if (!zones.length) {
    const noZone = await get('/api/consumer/coupon/list', { token });
    console.log('1) GET /consumer/coupon/list (no zone header) →', noZone.status, noZone.body);
    exitCode = 1;
  } else {
    const list = await get('/api/consumer/coupon/list', { token, zoneIds: zones });
    console.log('1) GET /consumer/coupon/list →', list.status, `count=${Array.isArray(list.body) ? list.body.length : 'n/a'}`);
    const found = couponInList(list.body, couponCode);
    console.log(`   Contains "${couponCode}":`, found ? 'YES' : 'NO');
    if (found) {
      foundAnywhere = true;
      console.log(
        '   Match:',
        JSON.stringify(
          list.body.find((c) => String(c.code).toUpperCase() === couponCode.toUpperCase()),
          null,
          2
        )
      );
    } else if (Array.isArray(list.body)) {
      console.log('   Codes returned:', list.body.map((c) => c.code).join(', ') || '(empty)');
    } else {
      console.log('   Body:', JSON.stringify(list.body, null, 2));
    }
    if (!found) exitCode = 1;
  }

  if (zones.length) {
    const listViaQuery = await get(
      `/api/consumer/coupon/list?zone_id=${encodeURIComponent(JSON.stringify(zones))}`,
      { token: token || undefined, zoneIds: zones }
    );
    if (token) {
      const foundQuery = couponInList(listViaQuery.body, couponCode);
      console.log('');
      console.log('1b) GET /consumer/coupon/list?zone_id=… →', listViaQuery.status);
      console.log(`   Contains "${couponCode}":`, foundQuery ? 'YES' : 'NO');
      if (foundQuery) foundAnywhere = true;
    }
  }

  const restId = await resolveRestaurantIdForTest(dbCoupon, zones, restaurantId);
  if (restId) {
    console.log('Restaurant id for scoped tests:', restId);
  }

  if (restId && Number.isFinite(restId)) {
    const restCoupons = await get(
      `/api/consumer/restaurants/coupons?restaurant_id=${restId}${token ? '' : ''}`,
      { token: token || undefined, zoneIds: zones.length ? zones : undefined }
    );
    const data = restCoupons.body?.data ?? restCoupons.body;
    console.log('');
    console.log(`2) GET /consumer/restaurants/coupons?restaurant_id=${restId} →`, restCoupons.status);
    const foundRest = couponInList(data, couponCode);
    console.log(`   Contains "${couponCode}":`, foundRest ? 'YES' : 'NO');
    if (foundRest) foundAnywhere = true;
    if (!foundRest && Array.isArray(data)) {
      console.log('   Codes returned:', data.map((c) => c.code).join(', ') || '(empty)');
    }
  } else if (zones.length) {
    console.log('');
    console.log(
      '2) GET /consumer/restaurants/coupons → skipped (set RESTAURANT_ID; e.g. RESTAURANT_ID=3 for zone 11)'
    );
  } else {
    console.log('');
    console.log('2) GET /consumer/restaurants/coupons → skipped (set RESTAURANT_ID for restaurant-scoped test)');
  }

  if (token && restId && Number.isFinite(restId)) {
    const apply = await get(
      `/api/consumer/coupon/apply?code=${encodeURIComponent(couponCode)}&restaurant_id=${restId}`,
      { token, zoneIds: zones.length ? zones : undefined }
    );
    console.log('');
    console.log('3) GET /consumer/coupon/apply →', apply.status);
    console.log('   ', JSON.stringify(apply.body, null, 2));
  }

  console.log('');
  if (foundAnywhere) {
    console.log('Result: PASS — coupon returned by at least one customer coupon API.');
    process.exit(0);
  }
  if (!token) {
    console.log(
      'Result: INCOMPLETE — no auth token; restaurant/public endpoints may still work (see step 2).'
    );
    process.exit(restId && Number.isFinite(restId) ? (foundAnywhere ? 0 : 1) : 1);
  }
  console.log('Result: FAIL — coupon not returned (check zone id matches coupon data, dates, status).');
  process.exit(exitCode || 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
