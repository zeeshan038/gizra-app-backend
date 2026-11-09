/**
 * E2E smoke test for Time-Based Delivery Distance Restriction (frontend + API).
 *
 * Usage:
 *   npx ts-node scripts/test-delivery-distance-time-restriction-e2e.ts
 *
 * Env:
 *   GIZRA_API_URL=http://127.0.0.1:3000   (host only; script adds /api)
 *   RESTAURANT_ID=3
 *   ADMIN_EMAIL=admin@gizra.com  ADMIN_PASSWORD=12345678
 *   CONSUMER_PHONE=+972501000001 CONSUMER_PASSWORD=password  (or GIZRA_TOKEN)
 *   ACTIVATE_WINDOW=1          widen restriction window to "now" (default 1)
 *   RESTORE_CONFIG=1           restore prior admin config after test (default 1)
 *   PLACE_NEAR_COD=0           if 1, places one COD order at near address (creates order row)
 *
 * Output: scripts/output/delivery-distance-restriction-frontend-handoff.json
 */
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import prisma from '../src/config/database';
import {
  formatMinutesAsHHMM,
  wallClockMinutesInZone,
} from '../src/utils/delivery/deliveryDistanceTimeRestriction';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DELIVERY_DISTANCE_TIME_RESTRICTED_CODE = 'DELIVERY_DISTANCE_TIME_RESTRICTED';

const restaurantId = Number(process.env.RESTAURANT_ID || '3');
const activateWindow = process.env.ACTIVATE_WINDOW !== '0';
const restoreConfig = process.env.RESTORE_CONFIG !== '0';
const placeNearCod = process.env.PLACE_NEAR_COD === '1';
const E2E_CONSUMER_PHONE = (process.env.E2E_CONSUMER_PHONE || '+972501000099').trim();
const E2E_CONSUMER_PASSWORD = process.env.E2E_CONSUMER_PASSWORD || 'password';

const host = (process.env.GIZRA_API_URL || `http://127.0.0.1:${process.env.PORT || 3000}`).replace(
  /\/$/,
  ''
);
const api = `${host}/api`;

type Json = Record<string, unknown>;

async function http(
  method: string,
  urlPath: string,
  opts?: { token?: string; body?: unknown }
): Promise<{ status: number; json: Json }> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (opts?.token) headers.Authorization = `Bearer ${opts.token}`;

  const res = await fetch(`${api}${urlPath}`, {
    method,
    headers,
    body: opts?.body != null ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: Json = {};
  try {
    json = JSON.parse(text) as Json;
  } catch {
    json = { _raw: text.slice(0, 500) };
  }
  return { status: res.status, json };
}

async function adminToken(): Promise<string> {
  const email = (process.env.ADMIN_EMAIL || 'admin@gizra.com').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '12345678';
  const { status, json } = await http('POST', '/admin/auth/login', {
    body: { email, password },
  });
  const token = (json.data as { token?: string } | undefined)?.token;
  if (status !== 200 || !token) {
    throw new Error(`Admin login failed (${status}): ${JSON.stringify(json)}`);
  }
  return token;
}

async function ensureE2eConsumer(zoneId: number, passwordHash: string): Promise<void> {
  const email = 'e2e.distance-restriction@gizra.test';
  let user = await prisma.users.findFirst({
    where: { OR: [{ phone: E2E_CONSUMER_PHONE }, { email }] },
  });
  if (!user) {
    user = await prisma.users.create({
      data: {
        f_name: 'E2E',
        l_name: 'Distance',
        phone: E2E_CONSUMER_PHONE,
        email,
        password: passwordHash,
        status: true,
        is_phone_verified: true,
        zone_id: zoneId,
        ref_code: 'E2ETMP',
      },
    });
    console.log('Created E2E consumer', E2E_CONSUMER_PHONE);
  } else {
    await prisma.users.update({
      where: { id: user.id },
      data: {
        password: passwordHash,
        status: true,
        is_phone_verified: true,
        zone_id: zoneId,
      },
    });
  }
}

async function consumerLogin(phone: string, password: string): Promise<string> {
  const { status, json } = await http('POST', '/consumer/login', {
    body: {
      login_type: 'manual',
      field_type: 'phone',
      email_or_phone: phone,
      password,
    },
  });
  const token = (json.data as { token?: string } | undefined)?.token;
  if (status !== 200 || !token) {
    throw new Error(`Consumer login failed (${status}): ${JSON.stringify(json)}`);
  }
  return token;
}

async function consumerToken(zoneId: number): Promise<string> {
  const existing = process.env.GIZRA_TOKEN || process.env.TOKEN;
  if (existing?.trim()) return existing.trim();

  const phone = process.env.CONSUMER_PHONE?.trim() || E2E_CONSUMER_PHONE;
  const password = process.env.CONSUMER_PASSWORD || E2E_CONSUMER_PASSWORD;

  try {
    return await consumerLogin(phone, password);
  } catch {
    if (phone !== E2E_CONSUMER_PHONE) throw new Error(`Consumer login failed for ${phone}`);
    const hash = await bcrypt.hash(E2E_CONSUMER_PASSWORD, 10);
    await ensureE2eConsumer(zoneId, hash);
    return consumerLogin(E2E_CONSUMER_PHONE, E2E_CONSUMER_PASSWORD);
  }
}

function windowAroundNow(tz: string, padBeforeMin = 15, padAfterMin = 180): { start: string; end: string } {
  const now = new Date();
  const cur = wallClockMinutesInZone(now, tz);
  const start = Math.max(0, cur - padBeforeMin);
  const end = Math.min(23 * 60 + 59, cur + padAfterMin);
  return {
    start: formatMinutesAsHHMM(start),
    end: formatMinutesAsHHMM(end),
  };
}

/** ~offsetDeg latitude from origin (1° lat ≈ 111 km). */
function pointKmFromRestaurant(
  lat: number,
  lng: number,
  kmNorth: number
): { lat: number; lng: number } {
  const dLat = kmNorth / 111;
  return { lat: lat + dLat, lng };
}

async function main() {
  console.log('=== Delivery distance time restriction E2E ===');
  console.log('API:', api);
  console.log('Restaurant ID:', restaurantId);

  const restaurant = await prisma.restaurants.findUnique({
    where: { id: BigInt(restaurantId) },
    select: {
      id: true,
      name: true,
      latitude: true,
      longitude: true,
      delivery: true,
      status: true,
      zone_id: true,
    },
  });
  if (!restaurant?.latitude || !restaurant.longitude) {
    throw new Error(`Restaurant ${restaurantId} missing or no coordinates`);
  }
  const rLat = Number(restaurant.latitude);
  const rLng = Number(restaurant.longitude);
  if (!Number.isFinite(rLat) || !Number.isFinite(rLng)) {
    throw new Error('Invalid restaurant coordinates');
  }

  const near = pointKmFromRestaurant(rLat, rLng, 5);
  const far = pointKmFromRestaurant(rLat, rLng, 14);

  const food = await prisma.food.findFirst({
    where: { restaurant_id: restaurantId, status: true },
    select: { id: true, name: true, price: true },
    orderBy: { id: 'asc' },
  });
  if (!food) {
    throw new Error(`No active food for restaurant ${restaurantId}. Add menu items first.`);
  }

  const zoneId = Number(restaurant.zone_id);
  if (!Number.isFinite(zoneId)) throw new Error('Restaurant has no zone_id');

  const adminTok = await adminToken();
  const consumerTok = await consumerToken(zoneId);

  const getCfg = await http('GET', '/admin/delivery-distance-time-restriction', {
    token: adminTok,
  });
  if (getCfg.status !== 200) {
    throw new Error(`GET restriction config failed: ${JSON.stringify(getCfg.json)}`);
  }

  const prior = (getCfg.json.data as { config?: Record<string, unknown> } | undefined)?.config;
  const tz = String(prior?.timezone || 'Asia/Jerusalem');

  let putBody: Record<string, unknown> | null = null;
  if (activateWindow && prior) {
    const win = windowAroundNow(tz);
    putBody = {
      enabled: true,
      max_distance_km: prior.max_distance_km ?? 10,
      start_time: win.start,
      end_time: win.end,
      timezone: tz,
      restaurant_ids: Array.isArray(prior.restaurant_ids) ? prior.restaurant_ids : [restaurantId],
    };
    const put = await http('PUT', '/admin/delivery-distance-time-restriction', {
      token: adminTok,
      body: putBody,
    });
    if (put.status !== 200) {
      throw new Error(`PUT restriction failed: ${JSON.stringify(put.json)}`);
    }
    console.log(`Activated test window ${win.start}–${win.end} (${tz})`);
  } else {
    console.log('ACTIVATE_WINDOW=0 — using existing admin schedule (may be outside hours).');
  }

  const cases: Array<{
    label: string;
    lat: number;
    lng: number;
    delivery_fee: { status: number; body: Json };
    quote: { status: number; body: Json };
  }> = [];

  for (const { label, lat, lng } of [
    { label: 'near_5km', ...near },
    { label: 'far_14km', ...far },
  ]) {
    const feeQ = new URLSearchParams({
      restaurant_id: String(restaurantId),
      destination_lat: String(lat),
      destination_lng: String(lng),
    });
    const feeRes = await http('GET', `/consumer/config/delivery-fee?${feeQ}`, {
      token: consumerTok,
    });

    const quoteBody = {
      restaurant_id: restaurantId,
      order_type: 'delivery',
      payment_method: 'cash_on_delivery',
      is_buy_now: true,
      latitude: String(lat),
      longitude: String(lng),
      address: `E2E test ${label}`,
      contact_person_number: process.env.CONSUMER_PHONE || E2E_CONSUMER_PHONE,
      distance: 99,
      cart: [
        {
          item_id: Number(food.id),
          quantity: 1,
          item_type: 'Food',
          price: Number(food.price),
        },
      ],
    };
    const quoteRes = await http('POST', '/consumer/order/quote', {
      token: consumerTok,
      body: quoteBody,
    });

    cases.push({
      label,
      lat,
      lng,
      delivery_fee: { status: feeRes.status, body: feeRes.json },
      quote: { status: quoteRes.status, body: quoteRes.json },
    });

    console.log(`\n--- ${label} (${lat.toFixed(5)}, ${lng.toFixed(5)}) ---`);
    console.log('  delivery-fee:', feeRes.status, feeRes.json.code || feeRes.json.msg);
    console.log('  quote:', quoteRes.status, quoteRes.json.code || quoteRes.json.msg);
  }

  let placeNear: { status: number; body: Json } | null = null;
  if (placeNearCod) {
    const placeBody = {
      restaurant_id: restaurantId,
      order_type: 'delivery',
      payment_method: 'cash_on_delivery',
      is_buy_now: true,
      latitude: String(near.lat),
      longitude: String(near.lng),
      address: 'E2E near COD place',
      contact_person_number: process.env.CONSUMER_PHONE || E2E_CONSUMER_PHONE,
      distance: 99,
      cart: [
        {
          item_id: Number(food.id),
          quantity: 1,
          item_type: 'Food',
          price: Number(food.price),
        },
      ],
    };
    const pr = await http('POST', '/consumer/order/place', { token: consumerTok, body: placeBody });
    placeNear = { status: pr.status, body: pr.json };
    console.log('\n--- PLACE_NEAR_COD ---', pr.status, pr.json.order_id || pr.json.msg);
  }

  if (restoreConfig && prior && putBody) {
    const restore = await http('PUT', '/admin/delivery-distance-time-restriction', {
      token: adminTok,
      body: {
        enabled: prior.enabled,
        max_distance_km: prior.max_distance_km,
        start_time: prior.start_time,
        end_time: prior.end_time,
        timezone: prior.timezone,
        restaurant_ids: prior.restaurant_ids,
      },
    });
    console.log('\nRestored prior admin config:', restore.status === 200 ? 'OK' : restore.json);
  }

  const handoff = {
    generated_at: new Date().toISOString(),
    api_base: api,
    restaurant: {
      id: restaurantId,
      name: restaurant.name,
      latitude: rLat,
      longitude: rLng,
    },
    test_addresses: {
      near_5km: { ...near, note: 'Should be allowed when restriction active' },
      far_14km: { ...far, note: 'Should return DELIVERY_DISTANCE_TIME_RESTRICTED when active' },
    },
    sample_food: { id: Number(food.id), name: food.name, price: Number(food.price) },
    consumer_auth: {
      hint: 'POST /api/consumer/login or set GIZRA_TOKEN',
      phone: process.env.CONSUMER_PHONE || E2E_CONSUMER_PHONE,
      password: process.env.CONSUMER_PASSWORD || E2E_CONSUMER_PASSWORD,
    },
    error_code: DELIVERY_DISTANCE_TIME_RESTRICTED_CODE,
    expected_when_active: {
      far_delivery_fee_http: 403,
      far_quote_http: 403,
      near_delivery_fee_http: 200,
      near_quote_http: 200,
      blocked_body_fields: ['code', 'msg', 'max_distance_km', 'restriction_end_time', 'timezone'],
    },
    cases,
    place_near_cod: placeNear,
    flutter_notes: [
      'Call GET /consumer/config/delivery-fee before checkout to show banner.',
      'Call POST /consumer/order/quote on address/restaurant change.',
      'On 403 with code DELIVERY_DISTANCE_TIME_RESTRICTED, show max km and restriction end time.',
      'Do not rely on client distance; server recomputes km.',
    ],
  };

  const outDir = path.join(__dirname, 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'delivery-distance-restriction-frontend-handoff.json');
  fs.writeFileSync(outPath, JSON.stringify(handoff, null, 2));
  console.log('\nWrote frontend handoff:', outPath);

  const farBlocked =
    cases.find((c) => c.label === 'far_14km')?.quote.body.code === DELIVERY_DISTANCE_TIME_RESTRICTED_CODE ||
    cases.find((c) => c.label === 'far_14km')?.delivery_fee.body.code ===
      DELIVERY_DISTANCE_TIME_RESTRICTED_CODE;
  const nearOk = cases.find((c) => c.label === 'near_5km')?.quote.status === 200;

  if (activateWindow && (!farBlocked || !nearOk)) {
    console.warn(
      '\nWARNING: Expected far=blocked and near=quote 200. Check restaurant is in restriction list and backend is running.'
    );
    process.exitCode = 1;
  } else {
    console.log('\nDone.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
