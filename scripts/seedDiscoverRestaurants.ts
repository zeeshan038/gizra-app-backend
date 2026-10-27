import dotenv from 'dotenv';
import path from 'path';
import prisma from '../src/config/database';
import { insertZone } from '../src/utils/zone/db';
import { LngLatPair, ringToPgPolygonLiteral } from '../src/utils/zone/geometry';

dotenv.config({ path: path.join(__dirname, '..', '.env') });
const apply = process.argv.includes('--apply');

const DISCOVER_ZONE_NAME = 'Gizra Discover Zone';
const SEED_VENDOR_EMAIL = 'discover-seed-vendor@gizra.local';

/** WGS84 ring: lng lat — covers Hebron cluster + Wisconsin test restaurant. */
const DISCOVER_ZONE_RING: LngLatPair[] = [
  [-92.5, 31.4],
  [-92.5, 45.0],
  [36.0, 45.0],
  [36.0, 31.4],
  [-92.5, 31.4],
];

const CENTER_LAT = 31.531;
const CENTER_LNG = 35.115;

async function ensurePostgis(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS postgis;');
  } catch (e) {
    console.warn('PostGIS extension skipped (zone-id API may need postgis/postgis image):', (e as Error).message);
  }
}

async function ensureDiscoverZone(): Promise<{ id: number; name: string; created: boolean }> {
  let row = await prisma.zones.findFirst({ where: { name: DISCOVER_ZONE_NAME } });
  if (row) {
    return { id: Number(row.id), name: row.name, created: false };
  }

  const any = await prisma.zones.findFirst({ orderBy: { id: 'asc' } });
  if (any) {
    return { id: Number(any.id), name: any.name, created: false };
  }

  if (!apply) {
    console.log(`Would create zone "${DISCOVER_ZONE_NAME}" with discover test polygon.`);
    return { id: 2, name: DISCOVER_ZONE_NAME, created: true };
  }

  await ensurePostgis();
  const id = await insertZone({
    name: DISCOVER_ZONE_NAME,
    display_name: 'Discover test zone',
    status: true,
    coordinates: DISCOVER_ZONE_RING,
    per_km_shipping_charge: 0.5,
    minimum_shipping_charge: 2,
    maximum_shipping_charge: 15,
    max_cod_order_amount: 500,
    increased_delivery_fee: 0,
    increased_delivery_fee_status: false,
    increase_delivery_charge_message: null,
  });
  row = await prisma.zones.findUnique({ where: { id: BigInt(id) } });
  console.log(`Created zone ${id} (${DISCOVER_ZONE_NAME}).`);
  return { id, name: row?.name ?? DISCOVER_ZONE_NAME, created: true };
}

const DEMO_RESTAURANTS = [
  { name: 'Nickel Barn & Coffee', phone: '+19995550001', order_count: 120n, lat: 31.528, lng: 35.123 },
  { name: 'Pizza Hub Discover', phone: '+19995550002', order_count: 85n, lat: 31.531, lng: 35.115 },
  { name: 'Hummus Corner', phone: '+19995550003', order_count: 60n, lat: 31.534, lng: 35.118 },
] as const;

async function ensureDemoRestaurants(targetZoneId: number): Promise<number> {
  const activeCount = await prisma.restaurants.count({ where: { status: true } });
  if (activeCount > 0) return activeCount;

  console.log('No active restaurants — would seed demo venues for popular/nearby.');

  if (!apply) return 0;

  let vendor = await prisma.vendors.findUnique({ where: { email: SEED_VENDOR_EMAIL } });
  if (!vendor) {
    vendor = await prisma.vendors.create({
      data: {
        f_name: 'Discover',
        l_name: 'Seed',
        phone: '+19995550000',
        email: SEED_VENDOR_EMAIL,
        password: '$2b$10$jNAdI92F3cqNzQT/59R5perqhCuuWdkeYhqt34ZzDKR7dWL3lUpE6',
        status: true,
      },
    });
    console.log('Created seed vendor', SEED_VENDOR_EMAIL);
  }

  for (const demo of DEMO_RESTAURANTS) {
    await prisma.restaurants.upsert({
      where: { phone: demo.phone },
      update: {
        status: true,
        zone_id: targetZoneId,
        latitude: String(demo.lat),
        longitude: String(demo.lng),
        order_count: demo.order_count,
        delivery_time: '30-45 min',
      },
      create: {
        name: demo.name,
        phone: demo.phone,
        address: 'Discover seed address',
        minimum_order: 10,
        vendor_id: Number(vendor.id),
        zone_id: targetZoneId,
        status: true,
        delivery: true,
        take_away: true,
        veg: true,
        non_veg: true,
        latitude: String(demo.lat),
        longitude: String(demo.lng),
        order_count: demo.order_count,
        delivery_time: '30-45 min',
        restaurant_model: 'commission',
      },
    });
  }

  const count = await prisma.restaurants.count({ where: { status: true } });
  console.log(`Seeded ${DEMO_RESTAURANTS.length} demo restaurants (${count} active total).`);
  return count;
}

function isValidGeo(lat: string | null, lng: string | null): boolean {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  if (la === 0 && ln === 0) return false;
  return Math.abs(la) <= 90 && Math.abs(ln) <= 180;
}

async function main() {
  console.log(apply ? 'Applying discover seed…' : 'Dry-run (pass --apply to write)…\n');

  const zoneInfo = await ensureDiscoverZone();
  const targetZoneId = zoneInfo.id;

  await ensureDemoRestaurants(targetZoneId);

  const zones = await prisma.zones.findMany({ orderBy: { id: 'asc' } });
  const validZoneIds = new Set(zones.map((z) => Number(z.id)));
  const targetZone = zones.find((z) => Number(z.id) === targetZoneId) ?? zones[0];

  let restaurants = await prisma.restaurants.findMany({
    where: { status: true },
    orderBy: { id: 'asc' },
  });

  console.log(`Target zone: ${targetZoneId} (${targetZone?.name ?? zoneInfo.name})`);
  console.log(`Active restaurants: ${restaurants.length}\n`);

  const polygon = ringToPgPolygonLiteral(DISCOVER_ZONE_RING);

  if (apply) {
    await prisma.$executeRaw`
      UPDATE zones
      SET coordinates = ${polygon}::polygon, updated_at = NOW()
      WHERE id = ${BigInt(targetZoneId)}
    `;
    console.log('Updated zone polygon for discover test coverage.');
  } else {
    console.log(`Would update zone ${targetZoneId} polygon for lat/lng coverage.`);
  }

  const orderCounts = [120, 85, 60, 40, 25, 12, 8, 5, 3, 1];
  let geoFixIndex = 0;

  for (let i = 0; i < restaurants.length; i++) {
    const r = restaurants[i];
    const id = Number(r.id);
    const patch: {
      zone_id?: number;
      latitude?: string;
      longitude?: string;
      order_count?: bigint;
    } = {};

    if (!validZoneIds.has(Number(r.zone_id))) {
      patch.zone_id = targetZoneId;
    }

    if (!isValidGeo(r.latitude, r.longitude)) {
      const offset = geoFixIndex * 0.002;
      patch.latitude = String(CENTER_LAT + offset);
      patch.longitude = String(CENTER_LNG + offset);
      geoFixIndex += 1;
    }

    const desiredOrders = BigInt(orderCounts[i % orderCounts.length]);
    if (r.order_count < desiredOrders) {
      patch.order_count = desiredOrders;
    }

    if (Object.keys(patch).length === 0) continue;

    console.log(
      `Restaurant ${id} (${r.name}):`,
      JSON.stringify(
        {
          ...patch,
          order_count: patch.order_count?.toString(),
        },
        null,
        0
      )
    );

    if (apply) {
      await prisma.restaurants.update({
        where: { id: r.id },
        data: {
          ...(patch.zone_id != null ? { zone_id: patch.zone_id } : {}),
          ...(patch.latitude != null ? { latitude: patch.latitude } : {}),
          ...(patch.longitude != null ? { longitude: patch.longitude } : {}),
          ...(patch.order_count != null ? { order_count: patch.order_count } : {}),
        },
      });
    }
  }

  const day = new Date().getDay();
  const openTime = new Date(Date.UTC(1970, 0, 1, 0, 0, 0));
  const closeTime = new Date(Date.UTC(1970, 0, 1, 23, 59, 0));

  for (const r of restaurants) {
    const restaurantId = Number(r.id);
    const existing = await prisma.restaurant_schedule.findFirst({
      where: { restaurant_id: restaurantId, day: BigInt(day) },
    });
    if (existing) continue;

    if (!apply) {
      console.log(`Would add today schedule for restaurant ${restaurantId}`);
    }
    if (apply) {
      await prisma.restaurant_schedule.create({
        data: {
          restaurant_id: restaurantId,
          day: BigInt(day),
          opening_time: openTime,
          closing_time: closeTime,
        },
      });
    }
  }

  const sampleLat = 31.528;
  const sampleLng = 35.123;
  console.log('\n--- Postman (after --apply) ---');
  console.log(`GET /api/consumer/config/zone-id?lat=${sampleLat}&lng=${sampleLng}`);
  console.log(
    `GET /api/consumer/restaurants/popular?zone_id=${targetZoneId}&latitude=${sampleLat}&longitude=${sampleLng}`
  );
  console.log(
    `GET /api/consumer/restaurants/nearby?zone_id=${targetZoneId}&latitude=${sampleLat}&longitude=${sampleLng}`
  );

  console.log(apply ? '\nDone.' : '\nDry-run complete. Re-run with --apply to persist.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
