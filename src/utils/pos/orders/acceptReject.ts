import { orders } from '@prisma/client';
import prisma from '../../../config/database';
import { emitOrderStatusRealtime } from '../../../sockets/orderRealtime';

export class PosOrderActionError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const ACCEPTABLE_FROM = new Set(['pending', 'confirmed', 'accepted']);

/**
 * Restaurant accept via POS — mirrors vendor confirmed/accepted path + realtime fan-out.
 */
export async function acceptOrderViaPos(order: orders): Promise<orders> {
  if (order.order_status === 'confirmed' || order.order_status === 'accepted') {
    // Idempotent: already accepted.
    return order;
  }
  if (order.order_status === 'canceled') {
    throw new PosOrderActionError(409, 'Order is already canceled');
  }
  if (!ACCEPTABLE_FROM.has(String(order.order_status))) {
    throw new PosOrderActionError(
      409,
      `Cannot accept order in status "${order.order_status}"`
    );
  }

  const now = new Date();
  const updateData: Record<string, unknown> = {
    order_status: 'confirmed',
    confirmed: order.confirmed ?? now,
    updated_at: now,
  };

  const restaurantZone = await prisma.restaurants.findUnique({
    where: { id: BigInt(Number(order.restaurant_id)) },
    select: { zone_id: true },
  });
  if (restaurantZone?.zone_id != null) {
    updateData.zone_id = Number(restaurantZone.zone_id);
  }

  const updated = await prisma.orders.update({
    where: { id: order.id },
    data: updateData,
  });

  emitOrderStatusRealtime(updated);
  return updated;
}

/**
 * Restaurant reject via POS — mirrors vendor canceled path.
 */
export async function rejectOrderViaPos(
  order: orders,
  cancellationReason?: string
): Promise<orders> {
  if (order.order_status === 'canceled') {
    return order;
  }
  if (['delivered', 'picked_up', 'handover'].includes(String(order.order_status))) {
    throw new PosOrderActionError(
      409,
      `Cannot reject order in status "${order.order_status}"`
    );
  }

  const now = new Date();
  const updated = await prisma.orders.update({
    where: { id: order.id },
    data: {
      order_status: 'canceled',
      canceled: now,
      canceled_by: 'restaurant',
      cancellation_reason: cancellationReason?.trim() || 'Rejected via POS',
      updated_at: now,
    },
  });

  emitOrderStatusRealtime(updated);
  return updated;
}
