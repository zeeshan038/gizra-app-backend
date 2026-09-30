import { orders, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { deliveryEarningFromOrder } from './earningsHelpers';
import { endOfDay, startOfDay, startOfMonth, startOfWeek } from './periodBounds';

export type DeliveryManHomeStats = {
  todays_order_count: number;
  this_week_order_count: number;
  this_month_order_count: number;
  todays_earning: number;
};

/**
 * Driver home dashboard (legacy PHP DeliverymanController@get_profile stats).
 * Order counts: assigned orders by `accepted` timestamp.
 * Today's earning: sum(original_delivery_charge + dm_tips) on order_transactions created today
 * (same as PHP). Falls back to delivered orders today if no txn rows yet.
 */
async function sumDeliveredEarningsToday(
  dmId: Prisma.Decimal,
  todayStart: Date,
  todayEnd: Date
): Promise<number> {
  const delivered = await prisma.orders.findMany({
    where: {
      delivery_man_id: dmId,
      order_type: { not: 'pos' },
      order_status: 'delivered',
      delivered: { gte: todayStart, lt: todayEnd },
    },
    select: {
      original_delivery_charge: true,
      delivery_charge: true,
      dm_tips: true,
    },
  });
  return Math.round(
    delivered.reduce((sum, o) => sum + deliveryEarningFromOrder(o as orders), 0) * 100
  ) / 100;
}

export async function getDeliveryManHomeStats(
  deliveryManId: number
): Promise<DeliveryManHomeStats> {
  const dmId = new Prisma.Decimal(deliveryManId);
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const weekStart = startOfWeek(now);
  const monthStart = startOfMonth(now);

  const orderWhereBase = {
    delivery_man_id: dmId,
    order_type: { not: 'pos' },
  };

  const [todays_order_count, this_week_order_count, this_month_order_count, txnAgg] =
    await Promise.all([
      prisma.orders.count({
        where: {
          ...orderWhereBase,
          accepted: { gte: todayStart, lt: todayEnd },
        },
      }),
      prisma.orders.count({
        where: {
          ...orderWhereBase,
          accepted: { gte: weekStart },
        },
      }),
      prisma.orders.count({
        where: {
          ...orderWhereBase,
          accepted: { gte: monthStart },
        },
      }),
      prisma.order_transactions.aggregate({
        where: {
          delivery_man_id: dmId,
          created_at: { gte: todayStart, lt: todayEnd },
        },
        _sum: {
          original_delivery_charge: true,
          dm_tips: true,
        },
      }),
    ]);

  const delivery = Number(txnAgg._sum.original_delivery_charge ?? 0);
  const tips = Number(txnAgg._sum.dm_tips ?? 0);
  let todays_earning = Math.round((delivery + tips) * 100) / 100;

  if (todays_earning === 0) {
    todays_earning = await sumDeliveredEarningsToday(dmId, todayStart, todayEnd);
  }

  return {
    todays_order_count,
    this_week_order_count,
    this_month_order_count,
    todays_earning,
  };
}
