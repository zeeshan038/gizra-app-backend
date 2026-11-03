#!/usr/bin/env node
/**
 * Build pricing for order 100602 from DB (same mapper as GET /api/vendor/orders/:id).
 * Requires DATABASE_URL in .env and: npm run build
 */
require('../dist/loadEnv');
const prisma = require('../dist/config/database').default;
const { mapVendorOrderDetail, mapOrderDetailLineItem } = require('../dist/utils/vendor/order/detailMapper');

const ORDER_ID = BigInt(process.argv[2] || 100602);

async function main() {
  const order = await prisma.orders.findFirst({ where: { id: ORDER_ID } });
  if (!order) {
    console.error(`Order ${ORDER_ID} not found`);
    process.exit(1);
  }

  const details = await prisma.order_details.findMany({
    where: { order_id: Number(ORDER_ID) },
  });
  const foodIds = details.map((d) => d.food_id).filter(Boolean);
  const foods = foodIds.length
    ? await prisma.food.findMany({ where: { id: { in: foodIds } } })
    : [];
  const foodById = new Map(foods.map((f) => [f.id.toString(), f]));

  const items = details.map((row) =>
    mapOrderDetailLineItem(row, foodById.get(row.food_id?.toString() ?? '') ?? null)
  );

  const restaurant = order.restaurant_id
    ? await prisma.restaurants.findFirst({ where: { id: order.restaurant_id } })
    : null;

  const payload = mapVendorOrderDetail(
    order,
    null,
    items,
    restaurant
      ? {
          name: restaurant.name,
          address: restaurant.address,
          logo: restaurant.logo,
          latitude: restaurant.latitude,
          longitude: restaurant.longitude,
        }
      : null
  );

  console.log(`Local mapper — order #${ORDER_ID}\n`);
  console.log(JSON.stringify({ pricing: payload.pricing, items: payload.items }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
