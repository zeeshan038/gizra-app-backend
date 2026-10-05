#!/usr/bin/env node
/**
 * Prepare a restaurant + zone drivers for POS manual dispatch → driver /orders/latest.
 *
 * Usage:
 *   node scripts/fix-manual-dispatch-restaurant.js [restaurantId]
 *   RESTAURANT_ID=3 node scripts/fix-manual-dispatch-restaurant.js
 */
require('dotenv').config();
const { PrismaClient, Prisma } = require('@prisma/client');

const RESTAURANT_ID = Number(process.argv[2] || process.env.RESTAURANT_ID || 3);

const prisma = new PrismaClient();

async function ensureManualDispatchColumn() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS manual_dispatch BOOLEAN NOT NULL DEFAULT false
  `);
}

async function eligibleRestaurantIdsInZone(zoneId) {
  const [commissionRestaurants, subscriptionRestaurants] = await Promise.all([
    prisma.restaurants.findMany({
      where: {
        zone_id: zoneId,
        restaurant_model: 'commission',
        self_delivery_system: false,
      },
      select: { id: true, name: true },
    }),
    prisma.restaurants.findMany({
      where: { zone_id: zoneId, restaurant_model: 'subscription' },
      select: { id: true, name: true },
    }),
  ]);

  const subscriptionIds = subscriptionRestaurants.map((r) => Number(r.id));
  let subscriptionEligible = [];
  if (subscriptionIds.length > 0) {
    const subs = await prisma.restaurant_subscriptions.findMany({
      where: {
        restaurant_id: { in: subscriptionIds },
        self_delivery: false,
        status: true,
      },
      select: { restaurant_id: true },
    });
    subscriptionEligible = subs.map((s) => Number(s.restaurant_id));
  }

  const ids = [
    ...new Set([
      ...commissionRestaurants.map((r) => Number(r.id)),
      ...subscriptionEligible,
    ]),
  ];
  return { ids, commissionRestaurants };
}

async function main() {
  if (!Number.isFinite(RESTAURANT_ID) || RESTAURANT_ID <= 0) {
    console.error('Invalid restaurant id:', RESTAURANT_ID);
    process.exit(1);
  }

  const before = await prisma.restaurants.findUnique({
    where: { id: BigInt(RESTAURANT_ID) },
    select: {
      id: true,
      name: true,
      zone_id: true,
      restaurant_model: true,
      self_delivery_system: true,
      delivery: true,
      status: true,
    },
  });

  if (!before) {
    console.error(`Restaurant ${RESTAURANT_ID} not found`);
    process.exit(1);
  }

  console.log('Before:', {
    id: Number(before.id),
    name: before.name,
    zone_id: before.zone_id != null ? Number(before.zone_id) : null,
    restaurant_model: before.restaurant_model,
    self_delivery_system: before.self_delivery_system,
    delivery: before.delivery,
    status: before.status,
  });

  const zoneId =
    before.zone_id != null ? Number(before.zone_id) : null;

  if (zoneId == null || !Number.isFinite(zoneId)) {
    console.error(
      'Restaurant has no zone_id. Assign a zone in admin first, then re-run this script.'
    );
    process.exit(1);
  }

  await ensureManualDispatchColumn();

  await prisma.restaurants.update({
    where: { id: BigInt(RESTAURANT_ID) },
    data: {
      restaurant_model: 'commission',
      self_delivery_system: false,
      delivery: true,
      status: true,
      updated_at: new Date(),
    },
  });

  await prisma.$executeRaw`
    UPDATE restaurants
    SET manual_dispatch = true, updated_at = NOW()
    WHERE id = ${BigInt(RESTAURANT_ID)}
  `;

  const dmUpdate = await prisma.delivery_men.updateMany({
    where: {
      application_status: 'approved',
      status: true,
      type: 'zone_wise',
    },
    data: {
      zone_id: new Prisma.Decimal(zoneId),
      updated_at: new Date(),
    },
  });

  const after = await prisma.restaurants.findUnique({
    where: { id: BigInt(RESTAURANT_ID) },
    select: {
      id: true,
      name: true,
      zone_id: true,
      restaurant_model: true,
      self_delivery_system: true,
      delivery: true,
      status: true,
    },
  });

  const manualRows = await prisma.$queryRaw`
    SELECT manual_dispatch FROM restaurants WHERE id = ${BigInt(RESTAURANT_ID)}
  `;

  const pool = await eligibleRestaurantIdsInZone(new Prisma.Decimal(zoneId));

  const drivers = await prisma.delivery_men.findMany({
    where: { application_status: 'approved', status: true, type: 'zone_wise' },
    select: { id: true, f_name: true, l_name: true, zone_id: true },
  });

  console.log('\nAfter restaurant update:', {
    id: Number(after.id),
    name: after.name,
    zone_id: Number(after.zone_id),
    restaurant_model: after.restaurant_model,
    self_delivery_system: after.self_delivery_system,
    manual_dispatch: Boolean(manualRows[0]?.manual_dispatch),
    in_driver_pool: pool.ids.includes(RESTAURANT_ID),
  });

  console.log(`\nZone ${zoneId} eligible restaurant ids for /orders/latest:`, pool.ids);
  console.log(`Updated ${dmUpdate.count} zone_wise approved driver(s) → zone_id ${zoneId}:`);
  for (const d of drivers) {
    console.log(
      `  - dm ${Number(d.id)} ${d.f_name || ''} ${d.l_name || ''} zone_id=${d.zone_id != null ? Number(d.zone_id) : null}`
    );
  }

  console.log('\nNext: Postman POST /api/vendor/dispatch/request-driver (new idempotency_key), then GET /api/delivery-man/orders/latest with rider token.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
