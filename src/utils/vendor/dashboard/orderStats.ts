import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';
import { getBusinessSetting } from '../../consumer/businessSettings';
import { passesScheduleWindow } from '../../deliveryman/orderHelpers';
import { notPosWhere } from '../order/query';
import { selfDeliveryEnabled } from '../restaurantSetup/loadRestaurant';

export type DashboardStatisticsType = 'overall' | 'today' | 'this_month';

export type VendorDashboardOrderStats = {
  confirmed: number;
  cooking: number;
  ready_for_delivery: number;
  food_on_the_way: number;
  delivered: number;
  refunded: number;
  scheduled: number;
  all: number;
};

function createdAtFilter(statisticsType: DashboardStatisticsType): Prisma.ordersWhereInput {
  if (statisticsType === 'today') {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return { created_at: { gte: start, lte: end } };
  }
  if (statisticsType === 'this_month') {
    const now = new Date();
    return {
      created_at: {
        gte: new Date(now.getFullYear(), now.getMonth(), 1),
        lt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      },
    };
  }
  return {};
}

function restaurantBase(restaurantId: number): Prisma.ordersWhereInput {
  return {
    restaurant_id: restaurantId,
    ...notPosWhere,
  };
}

/** PHP Order::scopeScheduled — scheduled flag and not an ASAP order (created_at <> schedule_at). */
function isScheduledOrder(order: { scheduled: boolean; created_at: Date | null; schedule_at: Date | null }) {
  if (!order.scheduled) return false;
  if (!order.created_at || !order.schedule_at) return false;
  return order.created_at.getTime() !== order.schedule_at.getTime();
}

function buildStatusExclusionFilter(
  orderConfirmationRestaurant: boolean,
  selfDelivery: boolean
): Prisma.ordersWhereInput {
  const restaurantConfirms = orderConfirmationRestaurant || selfDelivery;
  const excluded = restaurantConfirms
    ? ['failed', 'canceled', 'refund_requested', 'refunded']
    : ['pending', 'failed', 'canceled', 'refund_requested', 'refunded'];

  return {
    OR: [
      { order_status: { notIn: excluded } },
      {
        AND: [{ order_status: 'pending' }, { order_type: 'take_away' }],
      },
    ],
  };
}

/**
 * Vendor dashboard order cards — mirrors PHP Vendor\\DashboardController::dashboard_order_stats_data().
 */
export async function getVendorDashboardOrderStats(
  restaurantId: number,
  statisticsType: DashboardStatisticsType
): Promise<VendorDashboardOrderStats> {
  const restaurant = await prisma.restaurants.findUnique({
    where: { id: BigInt(restaurantId) },
    select: { restaurant_model: true, self_delivery_system: true },
  });
  if (!restaurant) {
    return {
      confirmed: 0,
      cooking: 0,
      ready_for_delivery: 0,
      food_on_the_way: 0,
      delivered: 0,
      refunded: 0,
      scheduled: 0,
      all: 0,
    };
  }

  const selfDelivery = await selfDeliveryEnabled(restaurant, restaurantId);
  const orderConfirmationModel =
    (await getBusinessSetting('order_confirmation_model')) ?? 'deliveryman';
  const orderConfirmationRestaurant = orderConfirmationModel === 'restaurant';

  const dateFilter = createdAtFilter(statisticsType);
  const base = { ...restaurantBase(restaurantId), ...dateFilter };

  const [
    confirmedCandidates,
    cooking,
    ready_for_delivery,
    food_on_the_way,
    delivered,
    refunded,
    scheduledCandidates,
    allCandidates,
  ] = await Promise.all([
    prisma.orders.findMany({
      where: {
        ...base,
        order_status: { in: ['confirmed', 'accepted'] },
        confirmed: { not: null },
      },
      select: { created_at: true, schedule_at: true },
    }),
    prisma.orders.count({
      where: { ...base, order_status: 'processing' },
    }),
    prisma.orders.count({
      where: { ...base, order_status: 'handover' },
    }),
    prisma.orders.count({
      where: { ...base, order_status: 'picked_up' },
    }),
    prisma.orders.count({
      where: { ...base, order_status: 'delivered' },
    }),
    prisma.orders.count({
      where: { ...base, order_status: 'refunded' },
    }),
    prisma.orders.findMany({
      where: {
        ...base,
        scheduled: true,
        ...buildStatusExclusionFilter(orderConfirmationRestaurant, selfDelivery),
      },
      select: { scheduled: true, created_at: true, schedule_at: true, order_status: true, order_type: true },
    }),
    prisma.orders.findMany({
      where: {
        ...base,
        ...buildStatusExclusionFilter(orderConfirmationRestaurant, selfDelivery),
      },
      select: { order_status: true, order_type: true },
    }),
  ]);

  const confirmed = confirmedCandidates.filter((o) =>
    passesScheduleWindow(
      { schedule_at: o.schedule_at, created_at: o.created_at } as Parameters<
        typeof passesScheduleWindow
      >[0],
      30
    )
  ).length;
  const scheduled = scheduledCandidates.filter((o) => isScheduledOrder(o)).length;
  const all = allCandidates.length;

  return {
    confirmed,
    cooking,
    ready_for_delivery,
    food_on_the_way,
    delivered,
    refunded,
    scheduled,
    all,
  };
}
