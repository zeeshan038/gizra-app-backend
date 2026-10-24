import prisma from '../../../config/database';
import { emitOrderStatusRealtime } from '../../../sockets/orderRealtime';
import { ORDER_SETTLEMENT_TX_OPTIONS } from '../../order/createOrderTransaction';
import { getBusinessSetting } from '../../deliveryman/orderHelpers';
import { notPosWhere } from '../../vendor/order/query';

export async function listNotifiedDeliveryMenForZone(zoneId: number | null) {
  if (zoneId == null || !Number.isFinite(zoneId)) return [];

  const maxOrdersRaw = await getBusinessSetting('dm_maximum_orders');
  const maxOrders = maxOrdersRaw ? Number(maxOrdersRaw) : 1;

  const rows = await prisma.delivery_men.findMany({
    where: {
      active: true,
      status: true,
      application_status: 'approved',
      zone_id: zoneId,
      current_orders: { lt: BigInt(Math.max(maxOrders, 1)) },
    },
    select: {
      id: true,
      f_name: true,
      l_name: true,
      phone: true,
      image: true,
      current_orders: true,
    },
    orderBy: { id: 'asc' },
    take: 50,
  });

  return rows.map((dm) => ({
    id: dm.id.toString(),
    name: [dm.f_name, dm.l_name].filter(Boolean).join(' ') || 'Delivery man',
    phone: dm.phone,
    image: dm.image,
    current_orders: Number(dm.current_orders) || 0,
  }));
}

export async function assignAdminOrderDeliveryMan(
  orderId: number,
  deliveryManId: number
): Promise<{ ok: true } | { ok: false; status: number; msg: string }> {
  if (!Number.isFinite(deliveryManId) || deliveryManId <= 0) {
    return { ok: false, status: 404, msg: 'Delivery man not found' };
  }

  const order = await prisma.orders.findFirst({
    where: { id: BigInt(orderId), ...notPosWhere },
  });
  if (!order) {
    return { ok: false, status: 404, msg: 'Order not found' };
  }

  if (order.delivery_man_id != null && Number(order.delivery_man_id) === deliveryManId) {
    return { ok: false, status: 400, msg: 'Order already assigned to this delivery man' };
  }

  const deliveryman = await prisma.delivery_men.findFirst({
    where: {
      id: BigInt(deliveryManId),
      active: true,
      status: true,
      application_status: 'approved',
    },
  });
  if (!deliveryman) {
    return { ok: false, status: 404, msg: 'Delivery man not found' };
  }

  const maxOrdersRaw = await getBusinessSetting('dm_maximum_orders');
  const maxOrders = maxOrdersRaw ? Number(maxOrdersRaw) : 1;
  if (Number(deliveryman.current_orders) >= maxOrders) {
    return { ok: false, status: 400, msg: 'Delivery man maximum order limit reached' };
  }

  if (order.payment_method === 'cash_on_delivery') {
    const maxCashRaw = await getBusinessSetting('dm_max_cash_in_hand');
    const maxCash = maxCashRaw ? Number(maxCashRaw) : 0;
    if (maxCash > 0) {
      const wallet = await prisma.delivery_man_wallets.findFirst({
        where: { delivery_man_id: deliveryManId },
      });
      const collected = wallet ? Number(wallet.collected_cash) : 0;
      const orderAmount = Number(order.order_amount) - Number(order.partially_paid_amount || 0);
      if (collected + orderAmount >= maxCash) {
        return { ok: false, status: 400, msg: 'Delivery man max cash in hand exceeds' };
      }
    }
  }

  const prevDmId =
    order.delivery_man_id != null && Number(order.delivery_man_id) > 0
      ? Number(order.delivery_man_id)
      : null;

  const nextStatus =
    order.order_status === 'pending' || order.order_status === 'confirmed'
      ? 'accepted'
      : order.order_status;

  const updatedOrder = await prisma.$transaction(async (tx) => {
    if (prevDmId != null && prevDmId !== deliveryManId) {
      const prev = await tx.delivery_men.findUnique({ where: { id: BigInt(prevDmId) } });
      if (prev) {
        const nextCount = Math.max(0, Number(prev.current_orders) - 1);
        await tx.delivery_men.update({
          where: { id: BigInt(prevDmId) },
          data: { current_orders: BigInt(nextCount), updated_at: new Date() },
        });
      }
    }

    const updated = await tx.orders.update({
      where: { id: BigInt(orderId) },
      data: {
        delivery_man_id: deliveryManId,
        order_status: nextStatus,
        accepted: order.accepted ?? new Date(),
        updated_at: new Date(),
      },
    });

    await tx.delivery_men.update({
      where: { id: BigInt(deliveryManId) },
      data: {
        current_orders: { increment: 1 },
        assigned_order_count: { increment: 1 },
        updated_at: new Date(),
      },
    });

    return updated;
  }, ORDER_SETTLEMENT_TX_OPTIONS);

  emitOrderStatusRealtime(updatedOrder);

  return { ok: true };
}
