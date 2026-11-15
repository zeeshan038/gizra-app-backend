import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { sendFcmToDevice, sendFcmToTopic, type FcmPushData } from './fcm';
import {
  resolvePushBroadcastTopic,
  type PushBroadcastTarget,
} from './pushBroadcastTopic';

const DEVICE_SEND_CONCURRENCY = 25;

export type AdminBroadcastSendResult = {
  topic: string;
  device_tokens: number;
  devices_delivered: number;
  topic_delivered: boolean;
  push_sent: boolean;
};

function uniqueTokens(tokens: Iterable<string | null | undefined>): string[] {
  const seen = new Set<string>();
  for (const raw of tokens) {
    const t = raw?.trim();
    if (t) seen.add(t);
  }
  return [...seen];
}

async function sendToTokens(tokens: string[], data: FcmPushData): Promise<number> {
  let delivered = 0;
  for (let i = 0; i < tokens.length; i += DEVICE_SEND_CONCURRENCY) {
    const chunk = tokens.slice(i, i + DEVICE_SEND_CONCURRENCY);
    const results = await Promise.all(chunk.map((token) => sendFcmToDevice(token, data)));
    delivered += results.filter(Boolean).length;
  }
  return delivered;
}

async function collectCustomerTokens(zone: 'all' | number): Promise<string[]> {
  const where: Prisma.usersWhereInput = {
    status: true,
    is_notification_on: { not: false },
    cm_firebase_token: { not: null },
    NOT: { cm_firebase_token: '' },
  };
  if (zone !== 'all') {
    where.zone_id = new Prisma.Decimal(zone);
  }
  const rows = await prisma.users.findMany({
    where,
    select: { cm_firebase_token: true },
  });
  return uniqueTokens(rows.map((r) => r.cm_firebase_token));
}

async function collectDeliverymanTokens(zone: 'all' | number): Promise<string[]> {
  const where: Prisma.delivery_menWhereInput = {
    status: true,
    application_status: 'approved',
    is_notification_on: { not: false },
    fcm_token: { not: null },
    NOT: { fcm_token: '' },
  };

  if (zone !== 'all') {
    const zoneDecimal = new Prisma.Decimal(zone);
    const restaurantsInZone = await prisma.restaurants.findMany({
      where: { zone_id: zoneDecimal, status: true },
      select: { id: true },
    });
    const restaurantIds = restaurantsInZone.map((r) => new Prisma.Decimal(Number(r.id)));
    where.AND = [
      {
        OR: [
          { zone_id: zoneDecimal, type: 'zone_wise' },
          ...(restaurantIds.length
            ? [{ type: 'restaurant_wise' as const, restaurant_id: { in: restaurantIds } }]
            : []),
        ],
      },
    ];
  }

  const rows = await prisma.delivery_men.findMany({
    where,
    select: { fcm_token: true },
  });
  return uniqueTokens(rows.map((r) => r.fcm_token));
}

async function collectRestaurantVendorTokens(zone: 'all' | number): Promise<string[]> {
  const restaurantWhere: Prisma.restaurantsWhereInput = {
    status: true,
    active: true,
  };
  if (zone !== 'all') {
    restaurantWhere.zone_id = new Prisma.Decimal(zone);
  }

  const restaurants = await prisma.restaurants.findMany({
    where: restaurantWhere,
    select: { vendor_id: true },
  });

  const vendorIds = [
    ...new Set(
      restaurants
        .map((r) => Number(r.vendor_id))
        .filter((id) => Number.isFinite(id) && id > 0)
    ),
  ];
  if (vendorIds.length === 0) return [];

  const vendors = await prisma.vendors.findMany({
    where: {
      id: { in: vendorIds.map((id) => BigInt(id)) },
      status: { not: false },
      is_notification_on: { not: false },
    },
    select: { firebase_token: true, fcm_token_web: true },
  });

  return uniqueTokens(vendors.flatMap((v) => [v.firebase_token, v.fcm_token_web]));
}

async function collectBroadcastDeviceTokens(
  tergat: PushBroadcastTarget,
  zone: 'all' | number
): Promise<string[]> {
  switch (tergat) {
    case 'customer':
      return collectCustomerTokens(zone);
    case 'deliveryman':
      return collectDeliverymanTokens(zone);
    case 'restaurant':
      return collectRestaurantVendorTokens(zone);
    default:
      return [];
  }
}

/** Admin marketing push — per-device FCM (primary) plus legacy topic (fallback for subscribed clients). */
export async function sendAdminPushBroadcast(
  tergat: PushBroadcastTarget,
  zone: 'all' | number,
  data: FcmPushData
): Promise<AdminBroadcastSendResult> {
  const topic = resolvePushBroadcastTopic(tergat, zone);
  const tokens = await collectBroadcastDeviceTokens(tergat, zone);

  const devicesDelivered = await sendToTokens(tokens, data);

  let topicDelivered = false;
  try {
    topicDelivered = await sendFcmToTopic(topic, data);
  } catch (e) {
    console.error('[notify] admin push topic failed', e);
  }

  const pushSent = devicesDelivered > 0 || topicDelivered;

  console.log(
    `[notify] admin broadcast tergat=${tergat} zone=${zone} devices=${devicesDelivered}/${tokens.length} topic=${topicDelivered ? 'ok' : 'miss'} topicName=${topic}`
  );

  return {
    topic,
    device_tokens: tokens.length,
    devices_delivered: devicesDelivered,
    topic_delivered: topicDelivered,
    push_sent: pushSent,
  };
}