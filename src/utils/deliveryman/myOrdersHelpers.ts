import { orders, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import {
  HISTORY_ORDER_STATUSES,
  orderStatusLabel,
  parseFoodImageFromDetail,
} from '../consumer/orderListHelpers';

function formatOrderDateTime(at: Date | null | undefined): {
  order_date: string | null;
  order_time: string | null;
} {
  if (!at) return { order_date: null, order_time: null };
  const d = new Date(at);
  const order_date = d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const order_time = d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return { order_date, order_time };
}

export function buildDeliveryManMyOrdersWhere(
  deliveryManId: number
): Prisma.ordersWhereInput {
  return {
    delivery_man_id: new Prisma.Decimal(deliveryManId),
    order_type: { not: 'pos' },
    order_status: { in: [...HISTORY_ORDER_STATUSES] },
  };
}

export type DmMyOrderListItem = {
  id: string;
  order_id: string;
  order_number: string;
  item_name: string | null;
  item_count: number;
  image: string;
  order_amount: number;
  order_status: string;
  status_label: string;
  order_date: string | null;
  order_time: string | null;
  created_at: string | null;
  delivered_at: string | null;
  restaurant_name: string | null;
};

export async function mapMyOrdersForDeliveryMan(
  orderRows: orders[]
): Promise<DmMyOrderListItem[]> {
  if (orderRows.length === 0) return [];

  const orderIds = orderRows.map((o) => Number(o.id));
  const restaurantIds = [
    ...new Set(orderRows.map((o) => Number(o.restaurant_id)).filter((id) => !Number.isNaN(id))),
  ];

  const [restaurants, details] = await Promise.all([
    prisma.restaurants.findMany({
      where: { id: { in: restaurantIds.map((id) => BigInt(id)) } },
      select: { id: true, name: true, logo: true },
    }),
    prisma.order_details.findMany({
      where: { order_id: { in: orderIds } },
      select: {
        order_id: true,
        food_id: true,
        food_details: true,
        quantity: true,
      },
      orderBy: { id: 'asc' },
    }),
  ]);

  const restaurantById = new Map(restaurants.map((r) => [Number(r.id), r]));
  const thumbByOrderId = new Map<number, string | null>();
  const itemCountByOrderId = new Map<number, number>();
  const firstFoodNameByOrderId = new Map<number, string>();

  for (const row of details) {
    const oid = Number(row.order_id);
    const qty = Number(row.quantity) || 1;
    itemCountByOrderId.set(oid, (itemCountByOrderId.get(oid) ?? 0) + qty);

    if (!thumbByOrderId.has(oid)) {
      thumbByOrderId.set(oid, parseFoodImageFromDetail(row));
    }

    if (!firstFoodNameByOrderId.has(oid) && row.food_details) {
      try {
        const parsed = JSON.parse(row.food_details) as { name?: string };
        if (parsed?.name) firstFoodNameByOrderId.set(oid, String(parsed.name));
      } catch {
        /* ignore */
      }
    }
  }

  const foodIds = details
    .map((d) => (d.food_id != null ? Number(d.food_id) : null))
    .filter((id): id is number => id != null && !Number.isNaN(id));

  if (foodIds.length) {
    const foods = await prisma.food.findMany({
      where: { id: { in: [...new Set(foodIds)].map((id) => BigInt(id)) } },
      select: { id: true, name: true, image: true },
    });
    const foodById = new Map(foods.map((f) => [Number(f.id), f]));

    for (const row of details) {
      const oid = Number(row.order_id);
      if (firstFoodNameByOrderId.has(oid)) continue;
      const foodId = row.food_id != null ? Number(row.food_id) : null;
      if (foodId != null) {
        const food = foodById.get(foodId);
        if (food?.name) firstFoodNameByOrderId.set(oid, food.name);
        if (!thumbByOrderId.get(oid) && food?.image) {
          thumbByOrderId.set(oid, food.image);
        }
      }
    }
  }

  return orderRows.map((order) => {
    const id = order.id.toString();
    const oid = Number(order.id);
    const restaurant = restaurantById.get(Number(order.restaurant_id));
    const displayAt = order.delivered ?? order.canceled ?? order.created_at;
    const { order_date, order_time } = formatOrderDateTime(displayAt);
    const image =
      thumbByOrderId.get(oid) ?? restaurant?.logo ?? 'default_logo.png';

    return {
      id,
      order_id: id,
      order_number: id,
      item_name: firstFoodNameByOrderId.get(oid) ?? restaurant?.name ?? null,
      item_count: itemCountByOrderId.get(oid) ?? 0,
      image: image ?? 'default_logo.png',
      order_amount: Number(order.order_amount) || 0,
      order_status: order.order_status,
      status_label: orderStatusLabel(order.order_status),
      order_date,
      order_time,
      created_at: order.created_at?.toISOString() ?? null,
      delivered_at: order.delivered?.toISOString() ?? null,
      restaurant_name: restaurant?.name ?? null,
    };
  });
}
