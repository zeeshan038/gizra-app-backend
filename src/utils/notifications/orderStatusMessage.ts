import { Prisma } from '@prisma/client';
import prisma from '../../config/database';

const STATUS_TO_MESSAGE_KEY: Record<string, string> = {
  pending: 'order_pending_message',
  confirmed: 'order_confirmation_msg',
  processing: 'order_processing_message',
  picked_up: 'out_for_delivery_message',
  handover: 'order_handover_message',
  delivered: 'order_delivered_message',
  delivery_boy_delivered: 'delivery_boy_delivered_message',
  accepted: 'delivery_boy_assign_message',
  canceled: 'order_cancled_message',
  refunded: 'order_refunded_message',
  refund_request_canceled: 'refund_request_canceled',
};

const FALLBACK_EN: Record<string, string> = {
  pending: 'Your order is pending.',
  confirmed: 'Your order is being prepared.',
  processing: 'Your order is being prepared.',
  picked_up: 'Your order has been picked up and is on the way.',
  handover: 'Your order is ready.',
  delivered: 'Your order has been delivered.',
  delivery_boy_delivered: 'Your order has been delivered.',
  accepted: 'A delivery partner has been assigned to your order.',
  canceled: 'Your order has been canceled.',
  refunded: 'Your order has been refunded.',
  refund_request_canceled: 'Your refund request was not approved.',
};

/** Customer tracking copy. Vendor accept (`confirmed`) and cooking (`processing`) both read as preparing. */
export function customerTrackingCopy(orderStatus: string): {
  status_label: string;
  message: string;
} {
  if (orderStatus === 'confirmed' || orderStatus === 'processing') {
    return {
      status_label: 'Preparing',
      message: FALLBACK_EN.processing,
    };
  }
  const message = FALLBACK_EN[orderStatus] ?? `Order status: ${orderStatus}`;
  const label = orderStatus.replace(/_/g, ' ');
  return {
    status_label: label.charAt(0).toUpperCase() + label.slice(1),
    message,
  };
}

function applyTemplate(
  template: string,
  vars: { user_name?: string; restaurant_name?: string; order_id?: string }
): string {
  let out = template;
  if (vars.user_name) out = out.replace(/\{user_name\}/g, vars.user_name);
  if (vars.restaurant_name) out = out.replace(/\{restaurant_name\}/g, vars.restaurant_name);
  if (vars.order_id) out = out.replace(/\{order_id\}/g, vars.order_id);
  return out;
}

export async function buildOrderStatusDescription(input: {
  status: string;
  lang?: string | null;
  user_name?: string;
  restaurant_name?: string;
  order_id: string;
}): Promise<string> {
  const key = STATUS_TO_MESSAGE_KEY[input.status];
  const lang = input.lang?.trim() || 'en';

  if (key) {
    const row = await prisma.notification_messages.findFirst({
      where: { key, status: true },
      select: { id: true, message: true },
    });
    if (row) {
      const vars = {
        user_name: input.user_name,
        restaurant_name: input.restaurant_name,
        order_id: input.order_id,
      };
      if (lang !== 'en') {
        try {
          const translated = await prisma.translations.findFirst({
            where: {
              translationable_type: 'App\\Models\\NotificationMessage',
              translationable_id: new Prisma.Decimal(row.id.toString()),
              locale: lang,
              key,
            },
            select: { value: true },
          });
          if (translated?.value?.trim()) {
            return applyTemplate(translated.value, vars);
          }
        } catch (e) {
          console.error('[notify] notification translation lookup failed', e);
        }
      }
      if (row.message?.trim()) {
        return applyTemplate(row.message, vars);
      }
    }
  }

  const fallback =
    FALLBACK_EN[input.status] ?? `Order #${input.order_id} — status: ${input.status}`;
  return applyTemplate(fallback, {
    user_name: input.user_name,
    restaurant_name: input.restaurant_name,
    order_id: input.order_id,
  });
}
