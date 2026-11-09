import { orders } from '@prisma/client';
import prisma from '../../../config/database';
import { parseFoodImageFromDetail } from '../../consumer/orderListHelpers';
import { publicFoodMediaUrl, publicRestaurantMediaUrl } from '../../mediaStorage';

/** First line-item food image per order (public CDN URL) for vendor kitchen / order list cards. */
export async function loadVendorOrderFoodImageUrls(
  orderRows: orders[]
): Promise<Map<number, string | null>> {
  const result = new Map<number, string | null>();
  if (!orderRows.length) return result;

  const orderIds = orderRows.map((o) => Number(o.id));
  const restaurantIds = [
    ...new Set(
      orderRows
        .map((o) => Number(o.restaurant_id))
        .filter((id) => Number.isFinite(id) && id > 0)
    ),
  ];

  const [details, restaurants] = await Promise.all([
    prisma.order_details.findMany({
      where: { order_id: { in: orderIds } },
      select: { order_id: true, food_id: true, food_details: true },
      orderBy: { id: 'asc' },
    }),
    restaurantIds.length
      ? prisma.restaurants.findMany({
          where: { id: { in: restaurantIds.map((id) => BigInt(id)) } },
          select: { id: true, logo: true },
        })
      : [],
  ]);

  const logoByRestaurantId = new Map(restaurants.map((r) => [Number(r.id), r.logo]));
  const rawThumbByOrderId = new Map<number, string | null>();

  for (const row of details) {
    const oid = Number(row.order_id);
    if (rawThumbByOrderId.has(oid)) continue;
    rawThumbByOrderId.set(oid, parseFoodImageFromDetail(row));
  }

  const foodIds = [
    ...new Set(
      details
        .map((d) => (d.food_id != null ? Number(d.food_id) : null))
        .filter((id): id is number => id != null && Number.isFinite(id))
    ),
  ];

  if (foodIds.length) {
    const foods = await prisma.food.findMany({
      where: { id: { in: foodIds.map((id) => BigInt(id)) } },
      select: { id: true, image: true },
    });
    const foodById = new Map(foods.map((f) => [Number(f.id), f.image]));

    for (const row of details) {
      const oid = Number(row.order_id);
      if (rawThumbByOrderId.get(oid)) continue;
      const foodId = row.food_id != null ? Number(row.food_id) : null;
      if (foodId == null) continue;
      const image = foodById.get(foodId);
      if (image) rawThumbByOrderId.set(oid, image);
    }
  }

  for (const order of orderRows) {
    const oid = Number(order.id);
    if (order.is_manual_dispatch) {
      const logo = logoByRestaurantId.get(Number(order.restaurant_id)) ?? null;
      result.set(oid, logo ? publicRestaurantMediaUrl(logo, 'logo') : null);
      continue;
    }
    const raw = rawThumbByOrderId.get(oid) ?? null;
    result.set(oid, raw ? publicFoodMediaUrl(raw) : null);
  }

  return result;
}
