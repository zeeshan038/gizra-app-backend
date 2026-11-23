import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';
import { connectionSupportsEvent, findActivePosConnection } from '../connections/repository';
import { buildPosOrderWebhookPayload, PosWebhookEvent } from './payload';

const MAX_ATTEMPTS = 8;

export async function enqueuePosOrderWebhook(input: {
  restaurantId: number;
  orderId: bigint | number | string;
  event: PosWebhookEvent;
}): Promise<{ enqueued: boolean; deliveryId?: string; reason?: string }> {
  const connection = await findActivePosConnection(input.restaurantId);
  if (!connection) {
    return { enqueued: false, reason: 'no_active_pos_connection' };
  }
  if (!connectionSupportsEvent(connection.events, input.event)) {
    return { enqueued: false, reason: 'event_not_subscribed' };
  }

  const eventId = `evt_${crypto.randomBytes(16).toString('hex')}`;
  const deliveryId = crypto.randomUUID();
  const now = new Date();

  try {
    await prisma.partner_webhook_deliveries.create({
      data: {
        partner_webhook_id: new Prisma.Decimal(connection.id.toString()),
        delivery_id: deliveryId,
        event: input.event,
        order_id: new Prisma.Decimal(String(input.orderId)),
        event_id: eventId,
        attempts: 0,
        next_attempt_at: now,
        created_at: now,
        updated_at: now,
      },
    });
  } catch (e: any) {
    // Unique event_id collision should be rare; treat as already enqueued.
    console.error('[pos-webhook] enqueue failed', e?.message || e);
    return { enqueued: false, reason: 'enqueue_failed' };
  }

  // Worker polls due rows; kick an immediate pass without circular import.
  void import('../queue/worker')
    .then(({ processDuePosWebhookDeliveries }) => processDuePosWebhookDeliveries(5))
    .catch((err) => console.error('[pos-webhook] immediate process failed', err));

  return { enqueued: true, deliveryId };
}

export async function enqueuePosOrderCreatedFromNotify(payload: {
  order_id: string;
  restaurant_id: number;
}): Promise<void> {
  try {
    await enqueuePosOrderWebhook({
      restaurantId: payload.restaurant_id,
      orderId: payload.order_id,
      event: 'order.created',
    });
  } catch (e) {
    console.error('[pos-webhook] order.created enqueue error', e);
  }
}

export function maxPosWebhookAttempts(): number {
  return MAX_ATTEMPTS;
}

export { buildPosOrderWebhookPayload };
