import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { buildCheckoutDeeplink, isAbandonedCartEnabled } from './config';
import { recordAnalyticsEvent } from './events';

// recordAnalyticsEvent used only in markAbandonedCartRecovered

export type CartSnapshotItem = {
  food_id: number | null;
  name: string | null;
  quantity: number;
  price: number;
  line_total: number;
};

export type CartSnapshot = {
  restaurant_id: number | null;
  restaurant_name: string | null;
  items: CartSnapshotItem[];
  total: number;
};

async function loadCartSnapshot(userId: number): Promise<CartSnapshot> {
  const rows = await prisma.carts.findMany({
    where: { user_id: userId, is_guest: false },
  });

  if (!rows.length) {
    return { restaurant_id: null, restaurant_name: null, items: [], total: 0 };
  }

  const foodIds = [
    ...new Set(
      rows
        .map((r) => Number(r.item_id))
        .filter((id) => Number.isFinite(id) && id > 0)
    ),
  ];

  const foods =
    foodIds.length > 0
      ? await prisma.food.findMany({
          where: { id: { in: foodIds.map((id) => BigInt(id)) } },
          select: { id: true, name: true, restaurant_id: true },
        })
      : [];
  const foodById = new Map(foods.map((f) => [Number(f.id), f]));

  const restaurantIds = [
    ...new Set(
      foods
        .map((f) => (f.restaurant_id != null ? Number(f.restaurant_id) : null))
        .filter((id): id is number => id != null && Number.isFinite(id))
    ),
  ];
  const restaurants =
    restaurantIds.length > 0
      ? await prisma.restaurants.findMany({
          where: { id: { in: restaurantIds.map((id) => BigInt(id)) } },
          select: { id: true, name: true, zone_id: true },
        })
      : [];
  const restaurantById = new Map(restaurants.map((r) => [Number(r.id), r]));

  const items: CartSnapshotItem[] = rows.map((row) => {
    const foodId = Number(row.item_id);
    const food = foodById.get(foodId);
    const qty = Number(row.quantity) || 0;
    const price = Number(row.price) || 0;
    return {
      food_id: Number.isFinite(foodId) ? foodId : null,
      name: food?.name ?? null,
      quantity: qty,
      price,
      line_total: Math.round(price * qty * 100) / 100,
    };
  });

  const total = Math.round(items.reduce((s, i) => s + i.line_total, 0) * 100) / 100;
  const primaryRestaurantId =
    foods.find((f) => f.restaurant_id != null)?.restaurant_id != null
      ? Number(foods.find((f) => f.restaurant_id != null)!.restaurant_id)
      : null;
  const restaurant =
    primaryRestaurantId != null ? restaurantById.get(primaryRestaurantId) : undefined;

  return {
    restaurant_id: primaryRestaurantId,
    restaurant_name: restaurant?.name ?? null,
    items,
    total,
  };
}

async function loadCustomerContact(userId: number): Promise<{
  name: string | null;
  phone: string | null;
  zone_id: number | null;
}> {
  const user = await prisma.users.findUnique({
    where: { id: BigInt(userId) },
    select: { f_name: true, l_name: true, phone: true, zone_id: true },
  });
  if (!user) return { name: null, phone: null, zone_id: null };
  const name = [user.f_name, user.l_name].filter(Boolean).join(' ').trim() || null;
  return {
    name,
    phone: user.phone?.trim() || null,
    zone_id: user.zone_id != null ? Number(user.zone_id) : null,
  };
}

/**
 * Upsert active abandoned-cart session for a logged-in user after cart activity.
 * Guests are skipped (no reliable WhatsApp phone).
 */
export async function touchAbandonedCartSession(params: {
  userId: number;
  isGuest: boolean;
  sourceEvent?: 'added_to_cart' | 'checkout_started' | 'cart_updated';
  zoneId?: number | null;
}): Promise<void> {
  if (!isAbandonedCartEnabled()) return;
  if (params.isGuest) return;
  if (!params.userId || !Number.isFinite(params.userId)) return;

  try {
    const snapshot = await loadCartSnapshot(params.userId);
    if (!snapshot.items.length) {
      await cancelActiveAbandonedCartSessions(params.userId, 'cart_empty');
      return;
    }

    const contact = await loadCustomerContact(params.userId);
    const now = new Date();
    const userDecimal = new Prisma.Decimal(params.userId);

    const existing = await prisma.abandoned_cart_sessions.findFirst({
      where: { user_id: userDecimal, status: 'active' },
      orderBy: { id: 'desc' },
    });

    const baseData = {
      restaurant_id:
        snapshot.restaurant_id != null
          ? new Prisma.Decimal(snapshot.restaurant_id)
          : null,
      restaurant_name: snapshot.restaurant_name,
      zone_id:
        params.zoneId != null
          ? new Prisma.Decimal(params.zoneId)
          : contact.zone_id != null
            ? new Prisma.Decimal(contact.zone_id)
            : null,
      last_activity_at: now,
      customer_name: contact.name,
      customer_phone: contact.phone,
      cart_total: snapshot.total,
      cart_snapshot: JSON.stringify(snapshot),
      updated_at: now,
      whatsapp_status: 'pending',
      whatsapp_sent_at: null,
      whatsapp_last_error: null,
      whatsapp_attempts: 0,
      abandoned_at: null,
    };

    if (existing) {
      const deeplink = buildCheckoutDeeplink({
        restaurantId: snapshot.restaurant_id,
        sessionId: existing.id.toString(),
      });
      await prisma.abandoned_cart_sessions.update({
        where: { id: existing.id },
        data: { ...baseData, deeplink },
      });
    } else {
      const created = await prisma.abandoned_cart_sessions.create({
        data: {
          user_id: userDecimal,
          status: 'active',
          created_at: now,
          ...baseData,
          deeplink: null,
        },
      });
      const deeplink = buildCheckoutDeeplink({
        restaurantId: snapshot.restaurant_id,
        sessionId: created.id.toString(),
      });
      await prisma.abandoned_cart_sessions.update({
        where: { id: created.id },
        data: { deeplink, updated_at: now },
      });
    }

  } catch (err) {
    console.error('[analytics] touchAbandonedCartSession failed', err);
  }
}

export async function cancelActiveAbandonedCartSessions(
  userId: number,
  reason = 'cancelled'
): Promise<void> {
  if (!isAbandonedCartEnabled()) return;
  try {
    const now = new Date();
    await prisma.abandoned_cart_sessions.updateMany({
      where: {
        user_id: new Prisma.Decimal(userId),
        status: 'active',
      },
      data: {
        status: 'cancelled',
        cancelled_at: now,
        updated_at: now,
        whatsapp_last_error: reason,
      },
    });
  } catch (err) {
    console.error('[analytics] cancelActiveAbandonedCartSessions failed', err);
  }
}

export async function markAbandonedCartRecovered(params: {
  userId: number;
  isGuest: boolean;
  orderId: bigint | number;
}): Promise<void> {
  if (!isAbandonedCartEnabled()) return;
  if (params.isGuest) return;

  try {
    const now = new Date();
    const orderIdNum = Number(params.orderId);
    await prisma.abandoned_cart_sessions.updateMany({
      where: {
        user_id: new Prisma.Decimal(params.userId),
        status: { in: ['active', 'abandoned'] },
      },
      data: {
        status: 'recovered',
        recovered_at: now,
        recovered_order_id: Number.isFinite(orderIdNum)
          ? new Prisma.Decimal(orderIdNum)
          : null,
        updated_at: now,
      },
    });

    await recordAnalyticsEvent({
      event_name: 'order_completed',
      user_id: params.userId,
      is_guest: false,
      properties: { order_id: orderIdNum, source: 'place_order' },
    });
  } catch (err) {
    console.error('[analytics] markAbandonedCartRecovered failed', err);
  }
}
