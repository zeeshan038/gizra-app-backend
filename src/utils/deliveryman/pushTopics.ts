import { orders, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { getBusinessSetting } from './orderHelpers';

export type DeliveryManTopicSource = {
  type: string;
  zone_id: Prisma.Decimal | null;
  vehicle_id: Prisma.Decimal | null;
  restaurant_id: Prisma.Decimal | null;
};

/** FCM topics a driver subscribes to at login — also used as Socket.IO rooms (with `topic:` prefix). */
export async function getDeliveryManFcmTopics(dm: DeliveryManTopicSource): Promise<string[]> {
  const topics: string[] = [];
  const zoneId = dm.zone_id != null ? Number(dm.zone_id) : null;

  if (zoneId != null && !Number.isNaN(zoneId)) {
    if (dm.vehicle_id) {
      topics.push(`delivery_man_${zoneId}_${Number(dm.vehicle_id)}`);
    }
    if (dm.type === 'zone_wise' || !dm.type) {
      const zone = await prisma.zones.findUnique({
        where: { id: BigInt(zoneId) },
        select: { deliveryman_wise_topic: true },
      });
      topics.push(zone?.deliveryman_wise_topic || `zone_${zoneId}_delivery_man`);
    }
    if (dm.type === 'restaurant_wise' && dm.restaurant_id != null) {
      topics.push(`restaurant_dm_${Number(dm.restaurant_id)}`);
    }
  } else if (dm.type === 'restaurant_wise' && dm.restaurant_id != null) {
    topics.push(`restaurant_dm_${Number(dm.restaurant_id)}`);
  }

  return [...new Set(topics)];
}

async function isPlatformDeliveryRestaurant(restaurantId: number): Promise<boolean> {
  const restaurant = await prisma.restaurants.findUnique({
    where: { id: BigInt(restaurantId) },
    select: {
      restaurant_model: true,
      self_delivery_system: true,
    },
  });
  if (!restaurant) return false;

  if (restaurant.restaurant_model === 'commission') {
    return !restaurant.self_delivery_system;
  }

  if (restaurant.restaurant_model === 'subscription') {
    const sub = await prisma.restaurant_subscriptions.findFirst({
      where: {
        restaurant_id: restaurantId,
        status: true,
      },
      select: { self_delivery: true },
      orderBy: { id: 'desc' },
    });
    return sub != null && !sub.self_delivery;
  }

  return false;
}

function isStatusEligibleForDriverPool(
  order: orders,
  orderConfirmationModel: string
): boolean {
  if (['confirmed', 'handover'].includes(order.order_status)) {
    return true;
  }
  if (order.order_status === 'pending') {
    if (order.subscription_id != null) return true;
    if (orderConfirmationModel === 'deliveryman') return true;
  }
  return false;
}

/** Topics to notify when a delivery job enters (or leaves) the unassigned pool — mirrors legacy FCM `order_request`. */
export async function getOrderRequestBroadcastTopics(order: orders): Promise<string[]> {
  if (order.order_type !== 'delivery' || order.scheduled) {
    return [];
  }

  const restaurantId = Number(order.restaurant_id);
  if (!Number.isFinite(restaurantId)) return [];

  const platformDelivery = await isPlatformDeliveryRestaurant(restaurantId);
  const topics: string[] = [];

  if (!platformDelivery) {
    topics.push(`restaurant_dm_${restaurantId}`);
    const restaurant = await prisma.restaurants.findUnique({
      where: { id: BigInt(restaurantId) },
      select: { zone_id: true },
    });
    const zid =
      restaurant?.zone_id != null ? Number(restaurant.zone_id) : Number.NaN;
    if (Number.isFinite(zid)) {
      if (order.vehicle_id != null) {
        topics.push(`delivery_man_${zid}_${Number(order.vehicle_id)}`);
      }
      const zone = await prisma.zones.findUnique({
        where: { id: BigInt(zid) },
        select: { deliveryman_wise_topic: true },
      });
      topics.push(zone?.deliveryman_wise_topic || `zone_${zid}_delivery_man`);
    }
    return [...new Set(topics)];
  }

  const zoneId =
    order.zone_id != null
      ? Number(order.zone_id)
      : (
          await prisma.restaurants.findUnique({
            where: { id: BigInt(restaurantId) },
            select: { zone_id: true },
          })
        )?.zone_id;

  const zid = zoneId != null ? Number(zoneId) : NaN;
  if (!Number.isFinite(zid)) return [];

  if (order.vehicle_id != null) {
    topics.push(`delivery_man_${zid}_${Number(order.vehicle_id)}`);
  }
  const zone = await prisma.zones.findUnique({
    where: { id: BigInt(zid) },
    select: { deliveryman_wise_topic: true },
  });
  topics.push(zone?.deliveryman_wise_topic || `zone_${zid}_delivery_man`);

  return [...new Set(topics)];
}

export async function shouldEmitDriverOrderRequest(order: orders): Promise<boolean> {
  if (order.order_type !== 'delivery') return false;
  if (order.delivery_man_id != null) return false;
  if (order.scheduled) return false;

  const orderConfirmationModel =
    (await getBusinessSetting('order_confirmation_model')) ??
    process.env.ORDER_CONFIRMATION_MODEL ??
    'restaurant';

  if (!isStatusEligibleForDriverPool(order, orderConfirmationModel)) {
    return false;
  }

  const topics = await getOrderRequestBroadcastTopics(order);
  return topics.length > 0;
}

/** Manual POS dispatch — notify every vehicle topic in the zone plus zone-wide (matches PHP). */
export async function getManualDispatchBroadcastTopics(zoneId: number): Promise<string[]> {
  if (!Number.isFinite(zoneId)) return [];

  const vehicleRows = await prisma.delivery_men.findMany({
    where: {
      zone_id: zoneId,
      application_status: 'approved',
      status: true,
      vehicle_id: { not: null },
    },
    distinct: ['vehicle_id'],
    select: { vehicle_id: true },
  });

  const topics = new Set<string>();
  for (const row of vehicleRows) {
    if (row.vehicle_id != null) {
      topics.add(`delivery_man_${zoneId}_${Number(row.vehicle_id)}`);
    }
  }

  const zone = await prisma.zones.findUnique({
    where: { id: BigInt(zoneId) },
    select: { deliveryman_wise_topic: true },
  });
  topics.add(zone?.deliveryman_wise_topic || `zone_${zoneId}_delivery_man`);

  return [...topics];
}
