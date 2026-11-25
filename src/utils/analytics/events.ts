import { Prisma } from '@prisma/client';
import prisma from '../../config/database';

export const ANALYTICS_EVENT_NAMES = [
  'app_opened',
  'store_viewed',
  'product_viewed',
  'added_to_cart',
  'checkout_started',
  'payment_failed',
  'distance_blocked',
  'order_completed',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

export function isAnalyticsEventName(value: string): value is AnalyticsEventName {
  return (ANALYTICS_EVENT_NAMES as readonly string[]).includes(value);
}

export type RecordAnalyticsEventInput = {
  event_name: AnalyticsEventName | string;
  user_id?: number | null;
  guest_id?: number | null;
  is_guest?: boolean;
  client_session?: string | null;
  restaurant_id?: number | null;
  zone_id?: number | null;
  properties?: Record<string, unknown> | null;
};

export async function recordAnalyticsEvent(input: RecordAnalyticsEventInput): Promise<void> {
  const eventName = String(input.event_name || '').trim();
  if (!eventName) return;

  try {
    await prisma.user_analytics_events.create({
      data: {
        event_name: eventName.slice(0, 64),
        user_id:
          input.user_id != null && Number.isFinite(input.user_id)
            ? new Prisma.Decimal(input.user_id)
            : null,
        guest_id:
          input.guest_id != null && Number.isFinite(input.guest_id)
            ? new Prisma.Decimal(input.guest_id)
            : null,
        is_guest: Boolean(input.is_guest),
        client_session: input.client_session?.trim()?.slice(0, 128) || null,
        restaurant_id:
          input.restaurant_id != null && Number.isFinite(input.restaurant_id)
            ? new Prisma.Decimal(input.restaurant_id)
            : null,
        zone_id:
          input.zone_id != null && Number.isFinite(input.zone_id)
            ? new Prisma.Decimal(input.zone_id)
            : null,
        properties: input.properties ? JSON.stringify(input.properties) : null,
      },
    });
  } catch (err) {
    console.error('[analytics] recordAnalyticsEvent failed', err);
  }
}

export async function recordAnalyticsEvents(
  events: RecordAnalyticsEventInput[]
): Promise<number> {
  let ok = 0;
  for (const ev of events) {
    await recordAnalyticsEvent(ev);
    ok += 1;
  }
  return ok;
}
