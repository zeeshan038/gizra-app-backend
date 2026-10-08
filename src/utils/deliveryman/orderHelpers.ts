import { orders, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import {
  parseDeliveryAddress,
  resolveOrderDeliveryAddress,
} from '../vendor/order/detailMapper';
import { publicMediaUrl } from '../mediaStorage';

export const DM_ACTIVE_ORDER_STATUSES = [
  'accepted',
  'confirmed',
  'pending',
  'processing',
  'picked_up',
  'handover',
] as const;

export const DM_LATEST_BASE_STATUSES = ['confirmed', 'accepted', 'processing', 'handover'] as const;

export function requireDmIdFromRequest(req: {
  user?: { id?: string };
}): number | null {
  const id = Number(req.user?.id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function getBusinessSetting(key: string): Promise<string | null> {
  const row = await prisma.business_settings.findFirst({ where: { key } });
  return row?.value ?? null;
}

function parseFoodNameFromDetails(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.name) {
      return String(parsed.name);
    }
  } catch {
    /* plain text fallback */
  }
  return null;
}

function formatAddressSnippet(raw: string | null): string | null {
  const parsed = parseDeliveryAddress(raw);
  if (!parsed) return null;
  const parts = [parsed.address, parsed.road, parsed.house, parsed.floor].filter(Boolean);
  return parts.join(', ') || null;
}

export type DmOrderListItem = {
  id: string;
  order_status: string;
  payment_method: string | null;
  order_amount: number;
  delivery_charge: number;
  schedule_at: string | null;
  restaurant_id: string;
  restaurant_name: string | null;
  customer_name: string | null;
  item_title: string | null;
  delivery_address_snippet: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  restaurant_image_url: string | null;
  customer_image_url: string | null;
};

const DEFAULT_RESTAURANT_IMAGE = 'default_logo.png';
const DEFAULT_CUSTOMER_IMAGE = 'def.png';

function driverMediaUrl(stored: string | null | undefined, fallback: string): string {
  const raw = stored?.trim() || fallback;
  return publicMediaUrl(raw) ?? raw;
}

async function loadFirstItemTitles(orderIds: bigint[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (orderIds.length === 0) return map;

  const details = await prisma.order_details.findMany({
    where: {
      order_id: { in: orderIds.map((id) => new Prisma.Decimal(id.toString())) },
    },
    orderBy: { id: 'asc' },
  });

  const foodIds = details
    .map((d) => (d.food_id != null ? Number(d.food_id) : null))
    .filter((id): id is number => id != null && !Number.isNaN(id));

  const foods =
    foodIds.length > 0
      ? await prisma.food.findMany({
          where: { id: { in: foodIds.map((id) => BigInt(id)) } },
          select: { id: true, name: true },
        })
      : [];
  const foodById = new Map(foods.map((f) => [Number(f.id), f.name]));

  for (const row of details) {
    const orderKey = row.order_id != null ? String(row.order_id) : '';
    if (!orderKey || map.has(orderKey)) continue;
    const foodId = row.food_id != null ? Number(row.food_id) : null;
    const title =
      (foodId != null ? foodById.get(foodId) : null) ??
      parseFoodNameFromDetails(row.food_details) ??
      'Order item';
    map.set(orderKey, title);
  }
  return map;
}

export async function mapOrdersForDeliveryManList(
  orderRows: orders[]
): Promise<DmOrderListItem[]> {
  if (orderRows.length === 0) return [];

  const restaurantIds = [
    ...new Set(orderRows.map((o) => Number(o.restaurant_id)).filter((id) => !Number.isNaN(id))),
  ];
  const userIds = [
    ...new Set(
      orderRows
        .map((o) => (o.user_id != null ? Number(o.user_id) : null))
        .filter((id): id is number => id != null && !Number.isNaN(id))
    ),
  ];

  const [restaurants, users, itemTitles] = await Promise.all([
    prisma.restaurants.findMany({
      where: { id: { in: restaurantIds.map((id) => BigInt(id)) } },
      select: { id: true, name: true, logo: true, cover_photo: true },
    }),
    userIds.length
      ? prisma.users.findMany({
          where: { id: { in: userIds.map((id) => BigInt(id)) } },
          select: { id: true, f_name: true, l_name: true, image: true },
        })
      : Promise.resolve([]),
    loadFirstItemTitles(orderRows.map((o) => o.id)),
  ]);

  const restaurantById = new Map(
    restaurants.map((r) => [
      Number(r.id),
      { name: r.name, logo: r.logo, cover_photo: r.cover_photo },
    ])
  );
  const userById = new Map(users.map((u) => [Number(u.id), u]));

  const addressRawByOrderId = new Map<string, string | null>();
  await Promise.all(
    orderRows.map(async (order) => {
      addressRawByOrderId.set(order.id.toString(), await resolveOrderDeliveryAddress(order));
    })
  );

  return orderRows.map((order) => {
    const id = order.id.toString();
    const user = order.user_id != null ? userById.get(Number(order.user_id)) : undefined;
    const customerName = user
      ? [user.f_name, user.l_name].filter(Boolean).join(' ') || null
      : null;
    const addressRaw = addressRawByOrderId.get(id) ?? order.delivery_address;
    const parsed = parseDeliveryAddress(addressRaw);
    const restaurant = restaurantById.get(Number(order.restaurant_id));
    const restaurantImageStored =
      restaurant?.logo?.trim() || restaurant?.cover_photo?.trim() || DEFAULT_RESTAURANT_IMAGE;
    const customerImageStored = user?.image?.trim() || DEFAULT_CUSTOMER_IMAGE;

    return {
      id,
      order_status: order.order_status,
      payment_method: order.payment_method,
      order_amount: Number(order.order_amount) || 0,
      delivery_charge: Number(order.delivery_charge) || 0,
      schedule_at: order.schedule_at?.toISOString() ?? null,
      restaurant_id: String(order.restaurant_id),
      restaurant_name: restaurant?.name ?? null,
      customer_name: customerName,
      item_title: itemTitles.get(id) ?? null,
      delivery_address_snippet: formatAddressSnippet(addressRaw),
      latitude: parsed?.latitude ?? null,
      longitude: parsed?.longitude ?? null,
      restaurant_image_url: driverMediaUrl(restaurantImageStored, DEFAULT_RESTAURANT_IMAGE),
      customer_image_url: driverMediaUrl(customerImageStored, DEFAULT_CUSTOMER_IMAGE),
    };
  });
}

/** Restaurants whose orders this zone-wise DM may claim (PHP get_latest_orders). */
export async function getEligibleRestaurantIdsForDm(dm: {
  type: string;
  zone_id: Prisma.Decimal | null;
  restaurant_id: Prisma.Decimal | null;
}): Promise<number[]> {
  if (dm.type === 'restaurant_wise') {
    const rid = dm.restaurant_id != null ? Number(dm.restaurant_id) : NaN;
    return Number.isFinite(rid) ? [rid] : [];
  }

  const zoneId = dm.zone_id != null ? Number(dm.zone_id) : NaN;
  if (!Number.isFinite(zoneId)) return [];

  const [commissionRestaurants, subscriptionRestaurants] = await Promise.all([
    prisma.restaurants.findMany({
      where: {
        zone_id: zoneId,
        restaurant_model: 'commission',
        self_delivery_system: false,
      },
      select: { id: true },
    }),
    prisma.restaurants.findMany({
      where: {
        zone_id: zoneId,
        restaurant_model: 'subscription',
      },
      select: { id: true },
    }),
  ]);

  const subscriptionIds = subscriptionRestaurants.map((r) => Number(r.id));
  let subscriptionEligible: number[] = [];
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

  return [
    ...new Set([
      ...commissionRestaurants.map((r) => Number(r.id)),
      ...subscriptionEligible,
    ]),
  ];
}

export function buildLatestOrderStatusFilter(
  dmType: string,
  orderConfirmationModel: string
): Prisma.ordersWhereInput {
  if (orderConfirmationModel === 'deliveryman' && dmType === 'zone_wise') {
    return {
      order_status: { in: ['pending', 'confirmed', 'accepted', 'processing', 'handover'] },
    };
  }

  return {
    OR: [
      {
        order_status: 'pending',
        subscription_id: { not: null },
      },
      {
        order_status: { in: ['confirmed', 'accepted', 'processing', 'handover'] },
      },
    ],
  };
}

/** PHP Order::scopeOrderScheduledIn(30) — scheduled within window or ASAP orders. */
export function passesScheduleWindow(order: orders, intervalMinutes: number): boolean {
  if (!order.schedule_at || !order.created_at) return true;

  const scheduleMs = order.schedule_at.getTime();
  const createdMs = order.created_at.getTime();
  if (scheduleMs === createdMs) return true;

  const now = Date.now();
  const windowEnd = now + intervalMinutes * 60 * 1000;
  if (scheduleMs <= now) return true;
  return scheduleMs >= now && scheduleMs <= windowEnd;
}

export function passesVehicleFilter(
  order: orders,
  dmVehicleId: number | null
): boolean {
  if (dmVehicleId == null) return true;
  if (order.is_manual_dispatch) return true;
  if (order.vehicle_id == null) return true;
  return Number(order.vehicle_id) === dmVehicleId;
}

export function passesNotDigitalPending(order: orders): boolean {
  const digital = ['digital_payment', 'offline_payment'];
  if (
    order.payment_method &&
    digital.includes(order.payment_method) &&
    order.order_status === 'pending'
  ) {
    return false;
  }
  return true;
}
