import prisma from '../../../config/database';
import { emitOrderStatusRealtime } from '../../../sockets/orderRealtime';
import { createOrderTransactionIfNeeded, ORDER_SETTLEMENT_TX_OPTIONS } from '../../order/createOrderTransaction';
import { notPosWhere } from '../../vendor/order/query';

export async function updateAdminOrderStatus(
  orderId: number,
  status: string,
  cancellationReason?: string
): Promise<{ ok: true; order: any } | { ok: false; status: number; msg: string }> {
  const order = await prisma.orders.findFirst({
    where: { id: BigInt(orderId), ...notPosWhere },
  });
  if (!order) {
    return { ok: false, status: 404, msg: 'Order not found' };
  }

  const now = new Date();
  const updateData: Record<string, unknown> = {
    order_status: status,
    updated_at: now,
  };

  if (status === 'confirmed') updateData.confirmed = now;
  if (status === 'processing') updateData.processing = now;
  if (status === 'handover') updateData.handover = now;
  if (status === 'picked_up' || status === 'food_on_the_way') {
    updateData.picked_up = now;
  }
  if (status === 'delivered') {
    updateData.delivered = now;
    updateData.payment_status = 'paid';
  }
  if (status === 'canceled') {
    updateData.canceled = now;
    updateData.canceled_by = 'admin';
    updateData.cancellation_reason = cancellationReason || null;
  }

  const prevDmId = order.delivery_man_id != null ? Number(order.delivery_man_id) : null;

  const updatedOrder = await prisma.$transaction(async (tx) => {
    if (status === 'delivered') {
      await createOrderTransactionIfNeeded(tx, BigInt(orderId));
      await tx.restaurants.update({
        where: { id: BigInt(Number(order.restaurant_id)) },
        data: { order_count: { increment: 1 }, updated_at: now },
      });
    }

    if ((status === 'delivered' || status === 'canceled') && prevDmId != null) {
      const dm = await tx.delivery_men.findUnique({
        where: { id: BigInt(prevDmId) },
      });
      if (dm) {
        const nextCurrent = Number(dm.current_orders) > 0 ? Number(dm.current_orders) - 1 : 0;
        await tx.delivery_men.update({
          where: { id: BigInt(prevDmId) },
          data: {
            current_orders: BigInt(nextCurrent),
            ...(status === 'delivered' ? { order_count: { increment: 1 } } : {}),
            updated_at: now,
          },
        });
      }
    }

    const updated = await tx.orders.update({
      where: { id: BigInt(orderId) },
      data: updateData,
    });

    return updated;
  }, ORDER_SETTLEMENT_TX_OPTIONS);

  emitOrderStatusRealtime(updatedOrder);

  return { ok: true, order: updatedOrder };
}
