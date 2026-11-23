import prisma from '../../../config/database';
import { buildPosOrderWebhookPayload, PosWebhookEvent } from '../webhook/payload';
import { buildPosWebhookHeaders } from '../webhook/signer';
import { maxPosWebhookAttempts } from '../webhook/publisher';

const BACKOFF_SECONDS = [30, 60, 120, 300, 600, 1800, 3600, 7200];

let workerTimer: NodeJS.Timeout | null = null;
let ticking = false;

function nextAttemptAt(attemptsAfterThis: number): Date {
  const idx = Math.min(Math.max(attemptsAfterThis - 1, 0), BACKOFF_SECONDS.length - 1);
  return new Date(Date.now() + BACKOFF_SECONDS[idx] * 1000);
}

export async function processDuePosWebhookDeliveries(limit = 20): Promise<number> {
  const now = new Date();
  const due = await prisma.partner_webhook_deliveries.findMany({
    where: {
      delivered_at: null,
      given_up_at: null,
      OR: [{ next_attempt_at: null }, { next_attempt_at: { lte: now } }],
    },
    orderBy: { id: 'asc' },
    take: limit,
  });

  let processed = 0;
  for (const delivery of due) {
    processed += 1;
    const webhookId = Number(delivery.partner_webhook_id);
    const connection = await prisma.partner_webhooks.findUnique({
      where: { id: BigInt(webhookId) },
    });
    if (!connection || !connection.active || connection.disabled_at) {
      await prisma.partner_webhook_deliveries.update({
        where: { id: delivery.id },
        data: {
          given_up_at: now,
          last_error: 'connection_inactive',
          updated_at: now,
        },
      });
      continue;
    }

    const orderIdNum = delivery.order_id != null ? Number(delivery.order_id) : null;
    if (orderIdNum == null || !Number.isFinite(orderIdNum)) {
      await prisma.partner_webhook_deliveries.update({
        where: { id: delivery.id },
        data: { given_up_at: now, last_error: 'missing_order_id', updated_at: now },
      });
      continue;
    }

    const eventId = delivery.event_id || delivery.delivery_id;
    const payload = await buildPosOrderWebhookPayload({
      event: delivery.event as PosWebhookEvent,
      eventId,
      orderId: BigInt(orderIdNum),
      restaurantId: Number(connection.restaurant_id),
      externalMerchantId: connection.external_merchant_id,
      provider: connection.provider,
    });

    if (!payload) {
      await prisma.partner_webhook_deliveries.update({
        where: { id: delivery.id },
        data: { given_up_at: now, last_error: 'order_not_found', updated_at: now },
      });
      continue;
    }

    const rawBody = JSON.stringify(payload);
    const headers = buildPosWebhookHeaders(rawBody, connection.signing_secret, eventId);
    const attemptNumber = Number(delivery.attempts) + 1;
    const firstAttemptedAt = delivery.first_attempted_at ?? now;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(connection.url, {
        method: 'POST',
        headers,
        body: rawBody,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const responseText = (await res.text()).slice(0, 2000);

      if (res.ok) {
        await prisma.$transaction([
          prisma.partner_webhook_deliveries.update({
            where: { id: delivery.id },
            data: {
              attempts: attemptNumber,
              first_attempted_at: firstAttemptedAt,
              delivered_at: now,
              last_response_code: res.status,
              response_body: responseText,
              last_error: null,
              next_attempt_at: null,
              updated_at: now,
            },
          }),
          prisma.partner_webhooks.update({
            where: { id: connection.id },
            data: { consecutive_failures: BigInt(0), updated_at: now },
          }),
        ]);
        continue;
      }

      const giveUp = attemptNumber >= maxPosWebhookAttempts();
      await prisma.$transaction([
        prisma.partner_webhook_deliveries.update({
          where: { id: delivery.id },
          data: {
            attempts: attemptNumber,
            first_attempted_at: firstAttemptedAt,
            last_response_code: res.status,
            response_body: responseText,
            last_error: `http_${res.status}`,
            next_attempt_at: giveUp ? null : nextAttemptAt(attemptNumber),
            given_up_at: giveUp ? now : null,
            updated_at: now,
          },
        }),
        prisma.partner_webhooks.update({
          where: { id: connection.id },
          data: {
            consecutive_failures: BigInt(Number(connection.consecutive_failures) + 1),
            updated_at: now,
            ...(giveUp && Number(connection.consecutive_failures) + 1 >= 20
              ? { active: false, disabled_at: now }
              : {}),
          },
        }),
      ]);
    } catch (e: any) {
      const giveUp = attemptNumber >= maxPosWebhookAttempts();
      const message = e?.name === 'AbortError' ? 'timeout' : String(e?.message || e).slice(0, 500);
      await prisma.partner_webhook_deliveries.update({
        where: { id: delivery.id },
        data: {
          attempts: attemptNumber,
          first_attempted_at: firstAttemptedAt,
          last_error: message,
          next_attempt_at: giveUp ? null : nextAttemptAt(attemptNumber),
          given_up_at: giveUp ? now : null,
          updated_at: now,
        },
      });
      await prisma.partner_webhooks.update({
        where: { id: connection.id },
        data: {
          consecutive_failures: BigInt(Number(connection.consecutive_failures) + 1),
          updated_at: now,
        },
      });
    }
  }

  return processed;
}

export function startPosWebhookWorker(intervalMs = 15000): void {
  if (workerTimer) return;
  workerTimer = setInterval(() => {
    if (ticking) return;
    ticking = true;
    processDuePosWebhookDeliveries()
      .catch((err) => console.error('[pos-webhook-worker]', err))
      .finally(() => {
        ticking = false;
      });
  }, intervalMs);
  // Avoid keeping process alive solely for the timer in some runtimes.
  if (typeof workerTimer.unref === 'function') workerTimer.unref();
  console.log('[pos-webhook-worker] started');
}

export async function replayPosWebhookDelivery(deliveryId: bigint | number | string) {
  const id = BigInt(deliveryId);
  const now = new Date();
  await prisma.partner_webhook_deliveries.update({
    where: { id },
    data: {
      given_up_at: null,
      delivered_at: null,
      next_attempt_at: now,
      updated_at: now,
    },
  });
  return processDuePosWebhookDeliveries(1);
}
