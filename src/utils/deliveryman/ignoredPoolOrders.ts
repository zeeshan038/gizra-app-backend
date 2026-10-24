import { Prisma } from '@prisma/client';
import prisma from '../../config/database';

function dmDecimal(deliveryManId: number): Prisma.Decimal {
  return new Prisma.Decimal(String(deliveryManId));
}

function orderDecimal(orderId: bigint | string | number): Prisma.Decimal {
  return new Prisma.Decimal(String(orderId));
}

/** Record that this driver dismissed an unassigned pool request (ignore / decline). */
export async function recordDeliveryManIgnoredPoolOrder(
  deliveryManId: number,
  orderId: bigint
): Promise<void> {
  const now = new Date();
  try {
    await prisma.delivery_man_ignored_orders.createMany({
      data: [
        {
          delivery_man_id: dmDecimal(deliveryManId),
          order_id: orderDecimal(orderId),
          created_at: now,
          updated_at: now,
        },
      ],
      skipDuplicates: true,
    });
  } catch (e) {
    console.warn('[dm] record ignored pool order failed', e);
  }
}

export async function getIgnoredPoolOrderIdSet(deliveryManId: number): Promise<Set<string>> {
  try {
    const rows = await prisma.delivery_man_ignored_orders.findMany({
      where: { delivery_man_id: dmDecimal(deliveryManId) },
      select: { order_id: true },
    });
    return new Set(rows.map((r) => String(r.order_id)));
  } catch (e) {
    console.warn('[dm] load ignored pool orders failed', e);
    return new Set();
  }
}

export async function isOrderIgnoredByDeliveryMan(
  deliveryManId: number,
  orderId: bigint
): Promise<boolean> {
  try {
    const row = await prisma.delivery_man_ignored_orders.findFirst({
      where: {
        delivery_man_id: dmDecimal(deliveryManId),
        order_id: orderDecimal(orderId),
      },
      select: { id: true },
    });
    return row != null;
  } catch (e) {
    console.warn('[dm] check ignored pool order failed', e);
    return false;
  }
}
