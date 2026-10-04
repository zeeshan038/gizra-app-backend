import { orders } from '@prisma/client';
import type { OrderRequestPayload, OrderUpdatedPayload } from '../types/sockets/realtime';
import {
  publishOrderNew,
  publishOrderRequest,
  publishOrderUpdated,
  publishOrderUpdatedToTopics,
} from './publish';
import { publishNewOrderToRestaurant } from '../utils/vendor/order/sseHub';
import {
  getManualDispatchBroadcastTopics,
  getOrderRequestBroadcastTopics,
  shouldEmitDriverOrderRequest,
} from '../utils/deliveryman/pushTopics';
import {
  passesNotDigitalPending,
  passesScheduleWindow,
} from '../utils/deliveryman/orderHelpers';
import { sendOrderNotification } from '../utils/notifications/sendOrderNotification';

export function emitNewOrderRealtime(payload: {
  order_id: string;
  restaurant_id: number;
  order_amount: number;
  order_type: string;
  payment_method: string | null;
}): void {
  publishNewOrderToRestaurant(payload.restaurant_id, {
    order_id: payload.order_id,
    order_amount: payload.order_amount,
    order_type: payload.order_type,
    payment_method: payload.payment_method,
  });

  publishOrderNew({
    order_id: payload.order_id,
    restaurant_id: payload.restaurant_id,
    order_amount: payload.order_amount,
    order_type: payload.order_type,
    payment_method: payload.payment_method,
  });
}

export function buildOrderRequestPayload(order: orders): OrderRequestPayload {
  return {
    order_id: order.id.toString(),
    restaurant_id: Number(order.restaurant_id),
    order_amount: Number(order.order_amount) || 0,
    order_type: order.order_type,
    payment_method: order.payment_method,
    order_status: order.order_status,
    zone_id: order.zone_id != null ? Number(order.zone_id) : null,
    vehicle_id: order.vehicle_id != null ? Number(order.vehicle_id) : null,
  };
}

/**
 * Realtime `order_request` for POS manual dispatch — same FCM topic rooms drivers join on connect.
 * Driver app on the request tab should refetch GET /delivery-man/orders/latest on this event.
 */
export async function emitManualDispatchOrderRequest(order: orders): Promise<void> {
  if (order.zone_id == null) return;
  const zoneId = Number(order.zone_id);
  if (!Number.isFinite(zoneId)) return;

  const topics = await getManualDispatchBroadcastTopics(zoneId);
  if (topics.length === 0) return;

  publishOrderRequest(topics, buildOrderRequestPayload(order));
}

async function maybeEmitDriverOrderRequest(order: orders): Promise<void> {
  if (
    !passesScheduleWindow(order, 30) ||
    !passesNotDigitalPending(order)
  ) {
    return;
  }
  const eligible = await shouldEmitDriverOrderRequest(order);
  if (!eligible) return;

  const topics = await getOrderRequestBroadcastTopics(order);
  publishOrderRequest(topics, buildOrderRequestPayload(order));
}

export function emitOrderStatusRealtime(order: orders): void {
  const payload: OrderUpdatedPayload = {
    order_id: order.id.toString(),
    restaurant_id: Number(order.restaurant_id),
    user_id: order.user_id?.toString() ?? null,
    delivery_man_id: order.delivery_man_id?.toString() ?? null,
    order_status: order.order_status,
    order_amount: Number(order.order_amount) || 0,
    order_type: order.order_type,
    payment_method: order.payment_method,
    updated_at: (order.updated_at ?? new Date()).toISOString(),
  };
  publishOrderUpdated(payload);

  void (async () => {
    try {
      await maybeEmitDriverOrderRequest(order);

      if (order.order_type === 'delivery' && order.delivery_man_id != null) {
        const topics = await getOrderRequestBroadcastTopics(order);
        publishOrderUpdatedToTopics(topics, payload);
      }

      await sendOrderNotification(order);
    } catch (err) {
      console.error('[socket] driver pool realtime failed', err);
    }
  })();
}
