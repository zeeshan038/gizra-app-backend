import { createHmac } from 'crypto';
import { abandoned_cart_sessions } from '@prisma/client';
import prisma from '../../config/database';
import {
  isWhatsappCartRecoveryEnabled,
  whatsappCartRecoveryTimeoutMs,
  whatsappCartRecoveryWebhookSecret,
  whatsappCartRecoveryWebhookUrl,
} from './config';

export type WhatsappCartRecoveryPayload = {
  event: 'abandoned_cart';
  abandoned_cart_id: string;
  abandoned_at: string | null;
  customer: {
    user_id: string;
    name: string | null;
    phone: string | null;
  };
  restaurant: {
    id: string | null;
    name: string | null;
  };
  cart: {
    total: number;
    items: unknown;
    snapshot: unknown;
  };
  deeplink: string | null;
  locale_hint: 'he';
};

function parseSnapshot(raw: string | null): { items?: unknown; total?: number } {
  if (!raw?.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function buildWhatsappCartRecoveryPayload(
  session: abandoned_cart_sessions
): WhatsappCartRecoveryPayload {
  const snapshot = parseSnapshot(session.cart_snapshot);
  return {
    event: 'abandoned_cart',
    abandoned_cart_id: session.id.toString(),
    abandoned_at: session.abandoned_at?.toISOString() ?? null,
    customer: {
      user_id: String(session.user_id),
      name: session.customer_name,
      phone: session.customer_phone,
    },
    restaurant: {
      id: session.restaurant_id != null ? String(session.restaurant_id) : null,
      name: session.restaurant_name,
    },
    cart: {
      total: Number(session.cart_total) || Number(snapshot.total) || 0,
      items: snapshot.items ?? [],
      snapshot,
    },
    deeplink: session.deeplink,
    locale_hint: 'he',
  };
}

function signBody(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

/**
 * POST recovery payload to WhatsApp bot webhook.
 * If disabled / no URL: mark skipped (no error). Only needs env keys later.
 */
export async function deliverWhatsappCartRecovery(
  sessionId: bigint
): Promise<'sent' | 'skipped' | 'failed'> {
  const session = await prisma.abandoned_cart_sessions.findUnique({
    where: { id: sessionId },
  });
  if (!session || session.status !== 'abandoned') return 'skipped';
  if (session.whatsapp_status === 'sent') return 'sent';

  if (!isWhatsappCartRecoveryEnabled()) {
    await prisma.abandoned_cart_sessions.update({
      where: { id: sessionId },
      data: {
        whatsapp_status: 'skipped',
        whatsapp_last_error: 'whatsapp_recovery_disabled_or_missing_url',
        updated_at: new Date(),
      },
    });
    console.info(
      '[analytics] WhatsApp recovery skipped (set WHATSAPP_CART_RECOVERY_ENABLED=1 + WEBHOOK_URL)',
      { abandoned_cart_id: sessionId.toString() }
    );
    return 'skipped';
  }

  const url = whatsappCartRecoveryWebhookUrl();
  if (!url) {
    await prisma.abandoned_cart_sessions.update({
      where: { id: sessionId },
      data: {
        whatsapp_status: 'skipped',
        whatsapp_last_error: 'missing_webhook_url',
        updated_at: new Date(),
      },
    });
    return 'skipped';
  }

  if (!session.customer_phone?.trim()) {
    await prisma.abandoned_cart_sessions.update({
      where: { id: sessionId },
      data: {
        whatsapp_status: 'skipped',
        whatsapp_last_error: 'missing_customer_phone',
        updated_at: new Date(),
      },
    });
    return 'skipped';
  }

  const payload = buildWhatsappCartRecoveryPayload(session);
  const rawBody = JSON.stringify(payload);
  const secret = whatsappCartRecoveryWebhookSecret();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Gizra-Event': 'abandoned_cart',
    'X-Gizra-Abandoned-Cart-Id': session.id.toString(),
  };
  if (secret) {
    headers['X-Gizra-Signature'] = signBody(rawBody, secret);
  }

  const attempts = Number(session.whatsapp_attempts) + 1;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), whatsappCartRecoveryTimeoutMs());

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: rawBody,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      await prisma.abandoned_cart_sessions.update({
        where: { id: sessionId },
        data: {
          whatsapp_status: 'failed',
          whatsapp_attempts: attempts,
          whatsapp_last_error: `http_${res.status}:${text.slice(0, 500)}`,
          updated_at: new Date(),
        },
      });
      return 'failed';
    }

    await prisma.abandoned_cart_sessions.update({
      where: { id: sessionId },
      data: {
        whatsapp_status: 'sent',
        whatsapp_sent_at: new Date(),
        whatsapp_attempts: attempts,
        whatsapp_last_error: null,
        updated_at: new Date(),
      },
    });
    return 'sent';
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.abandoned_cart_sessions.update({
      where: { id: sessionId },
      data: {
        whatsapp_status: 'failed',
        whatsapp_attempts: attempts,
        whatsapp_last_error: msg.slice(0, 500),
        updated_at: new Date(),
      },
    });
    console.error('[analytics] WhatsApp recovery webhook failed', msg);
    return 'failed';
  }
}
