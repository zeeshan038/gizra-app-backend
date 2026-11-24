/**
 * Live API smoke test for Early Close / Temporary Restaurant Pause.
 *
 * Prereq: API on PORT (default 3000). This script can start nothing — run `npm run dev` first,
 * or use: npm run test:restaurant-temporary-pause:e2e (expects server up).
 *
 *   npx ts-node scripts/test-restaurant-temporary-pause-e2e.ts
 *   RESTAURANT_ID=6 VENDOR_PASSWORD=password npx ts-node scripts/test-restaurant-temporary-pause-e2e.ts
 *
 * Sets a temporary vendor password for the restaurant owner (restores hash after).
 */
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';
import prisma from '../src/config/database';
import { timeToDate } from '../src/utils/vendor/restaurantSetup/helpers';
import { getDefaultRestaurantTimeZone } from '../src/utils/consumer/restaurantAvailability';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const host = (process.env.GIZRA_API_URL || `http://127.0.0.1:${process.env.PORT || 3000}`).replace(
  /\/$/,
  ''
);
const api = `${host}/api`;
const TEST_PASSWORD = process.env.VENDOR_PASSWORD || 'pause-e2e-temp-password';
const restaurantIdEnv = process.env.RESTAURANT_ID ? Number(process.env.RESTAURANT_ID) : null;

type Json = Record<string, unknown>;

let passed = 0;
let failed = 0;

function ok(label: string, cond: unknown, detail?: unknown): void {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail != null ? detail : '');
  }
}

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
    json = { _raw: text.slice(0, 400) };
  }
  return { status: res.status, json };
}

async function waitForApi(timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${api}/consumer/config/bootstrap`, { method: 'GET' });
      if (res.status > 0 && res.status < 500) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`API not reachable at ${api} within ${timeoutMs}ms`);
}

async function ensureTodaySchedule(restaurantId: bigint, timeZone: string): Promise<void> {
  const weekdayName = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
  }).format(new Date());
  const dayMap: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };
  const day = dayMap[weekdayName] ?? new Date().getDay();

  const existing = await prisma.restaurant_schedule.findFirst({
    where: { restaurant_id: Number(restaurantId), day: BigInt(day) },
  });
  if (existing) return;

  await prisma.restaurant_schedule.create({
    data: {
      restaurant_id: Number(restaurantId),
      day: BigInt(day),
      opening_time: timeToDate('00:00'),
      closing_time: timeToDate('23:59'),
      created_at: new Date(),
      updated_at: new Date(),
    },
  });
  console.log(`  (seeded all-day schedule for day=${day} so EARLY_CLOSE can run)`);
}

async function main(): Promise<void> {
  console.log('=== Restaurant temporary pause E2E ===');
  console.log(`API: ${api}`);

  await waitForApi();
  console.log('API is up\n');

  const restaurant =
    restaurantIdEnv != null
      ? await prisma.restaurants.findFirst({
          where: { id: BigInt(restaurantIdEnv), status: true },
        })
      : await prisma.restaurants.findFirst({
          where: { status: true, active: true },
          orderBy: { id: 'asc' },
        });

  if (!restaurant) throw new Error('No active restaurant found');

  const vendor = await prisma.vendors.findFirst({
    where: { id: BigInt(Number(restaurant.vendor_id)) },
  });
  if (!vendor?.email) throw new Error(`Vendor missing for restaurant #${restaurant.id}`);

  const timeZone = await getDefaultRestaurantTimeZone();
  await ensureTodaySchedule(restaurant.id, timeZone);

  // Clear any leftover pause from a previous failed run
  await prisma.restaurants.update({
    where: { id: restaurant.id },
    data: { paused_until: null, pause_message: null, pause_type: null },
  });

  const originalHash = vendor.password;
  const hash = await bcrypt.hash(TEST_PASSWORD, 10);
  await prisma.vendors.update({
    where: { id: vendor.id },
    data: { password: hash, updated_at: new Date() },
  });

  let vendorToken = '';
  try {
    console.log(`Restaurant #${restaurant.id} (${restaurant.name}) vendor=${vendor.email}`);

    const login = await http('POST', '/vendor/login', {
      body: { email: vendor.email, password: TEST_PASSWORD },
    });
    const token = (login.json.data as { token?: string } | undefined)?.token;
    ok('vendor login', login.status === 200 && Boolean(token), login.json);
    if (!token) throw new Error('Vendor login failed — aborting');
    vendorToken = token;

    // GET empty pause
    const get0 = await http('GET', '/vendor/restaurant/temporary-pause', { token: vendorToken });
    const d0 = get0.json.data as Json;
    ok('GET pause when idle', get0.status === 200 && d0?.is_paused === false, get0.json);

    // Apply PAUSE_30
    const apply30 = await http('POST', '/vendor/restaurant/temporary-pause', {
      token: vendorToken,
      body: { pause_type: 'PAUSE_30', message_preset: 'busy' },
    });
    const a30 = apply30.json.data as Json;
    ok(
      'POST PAUSE_30',
      apply30.status === 200 &&
        a30?.is_paused === true &&
        a30?.pause_type === 'PAUSE_30' &&
        typeof a30?.paused_until === 'string',
      apply30.json
    );

    const detailPaused = await http('GET', `/consumer/restaurants/${restaurant.id}`);
    const detailData = detailPaused.json.data as Json;
    ok(
      'consumer detail can_order=false while paused',
      detailPaused.status === 200 &&
        detailData?.can_order === false &&
        detailData?.is_temporarily_closed === true &&
        detailData?.pause_type === 'PAUSE_30',
      detailData
    );

    // Cancel pause (must not flip active)
    const activeBefore = restaurant.active;
    const cancel = await http('DELETE', '/vendor/restaurant/temporary-pause', {
      token: vendorToken,
    });
    const cData = cancel.json.data as Json;
    ok(
      'DELETE cancel pause',
      cancel.status === 200 && cData?.is_paused === false && cData?.active === activeBefore,
      cancel.json
    );

    const rowAfterCancel = await prisma.restaurants.findUnique({
      where: { id: restaurant.id },
      select: { active: true, status: true, paused_until: true, pause_type: true },
    });
    ok(
      'DB: pause cleared, active/status unchanged',
      rowAfterCancel?.paused_until == null &&
        rowAfterCancel?.pause_type == null &&
        rowAfterCancel?.active === activeBefore &&
        rowAfterCancel?.status === true,
      rowAfterCancel
    );

    // EARLY_CLOSE (requires open shift — we seeded all-day if needed)
    const early = await http('POST', '/vendor/restaurant/temporary-pause', {
      token: vendorToken,
      body: {
        pause_type: 'EARLY_CLOSE',
        message: 'E2E early close test',
      },
    });
    const eData = early.json.data as Json;
    ok(
      'POST EARLY_CLOSE',
      early.status === 200 && eData?.is_paused === true && eData?.pause_type === 'EARLY_CLOSE',
      early.json
    );

    // Invalid type
    const bad = await http('POST', '/vendor/restaurant/temporary-pause', {
      token: vendorToken,
      body: { pause_type: 'PAUSE_99' },
    });
    ok('reject invalid pause_type', bad.status === 400, bad.json);

    // Cleanup
    await http('DELETE', '/vendor/restaurant/temporary-pause', { token: vendorToken });

    const detailOpen = await http('GET', `/consumer/restaurants/${restaurant.id}`);
    const openData = detailOpen.json.data as Json;
    ok(
      'consumer detail pause fields null after cancel',
      detailOpen.status === 200 &&
        openData?.pause_type == null &&
        openData?.paused_until == null,
      {
        can_order: openData?.can_order,
        pause_type: openData?.pause_type,
        is_temporarily_closed: openData?.is_temporarily_closed,
      }
    );
  } finally {
    await prisma.restaurants.update({
      where: { id: restaurant.id },
      data: { paused_until: null, pause_message: null, pause_type: null },
    });
    if (originalHash) {
      await prisma.vendors.update({
        where: { id: vendor.id },
        data: { password: originalHash, updated_at: new Date() },
      });
      console.log('\nRestored original vendor password hash');
    }
    await prisma.$disconnect();
  }

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log('OK: temporary pause E2E passed');
}

main().catch(async (e) => {
  console.error(e);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
