import { orders } from '@prisma/client';
import type { OrderUpdatedPayload } from '../types/sockets/realtime';
import { publishOrderNew, publishOrderUpdated } from './publish';
import { publishNewOrderToRestaurant } from '../utils/vendor/order/sseHub';

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
}
