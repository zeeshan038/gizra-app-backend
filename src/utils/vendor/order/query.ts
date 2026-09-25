import { Prisma } from '@prisma/client';

/** Marketplace orders only — excludes in-store POS (`order_type = pos`). */
export const notPosWhere: Prisma.ordersWhereInput = {
  order_type: { not: 'pos' },
};

export const ORDER_LIST_STATUSES = [
  'all',
  'pending',
  'confirmed',
  'accepted',
  'cooking',
  'ready_for_delivery',
  'food_on_the_way',
  'delivered',
  'dine_in',
  'refunded',
  'refund_requested',
  'scheduled',
  'payment_failed',
  'canceled',
] as const;

export type OrderListStatus = (typeof ORDER_LIST_STATUSES)[number];

export function buildStatusFilter(status: OrderListStatus): Prisma.ordersWhereInput {
  switch (status) {
    case 'pending':
      return { order_status: 'pending' };
    case 'confirmed':
      return { order_status: 'confirmed' };
    case 'accepted':
      return { order_status: 'accepted' };
    case 'cooking':
      return { order_status: 'processing' };
    case 'ready_for_delivery':
      return { order_status: 'handover' };
    case 'food_on_the_way':
      return { order_status: 'picked_up' };
    case 'delivered':
      return { order_status: 'delivered' };
    case 'dine_in':
      return { order_type: 'dine_in' };
    case 'refunded':
      return { order_status: 'refunded' };
    case 'refund_requested':
      return { order_status: 'refund_requested' };
    case 'scheduled':
      return { scheduled: true };
    case 'payment_failed':
      return { order_status: 'failed' };
    case 'canceled':
      return { order_status: 'canceled' };
    case 'all':
    default:
      return {};
  }
}

export function restaurantOrdersBase(restaurantId: number): Prisma.ordersWhereInput {
  return {
    restaurant_id: restaurantId,
    ...notPosWhere,
  };
}
