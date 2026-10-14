import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';
import { notPosWhere } from '../../vendor/order/query';
import { dateFilterOnField } from './dateRanges';
import { AdminDashboardStatisticsType, AdminDashboardZoneId, AdminOrderStats } from './types';
import { ordersZoneWhere } from './zoneFilter';

const TERMINAL_STATUSES = [
  'delivered',
  'failed',
  'canceled',
  'refund_requested',
  'refund_request_canceled',
  'refunded',
] as const;

function baseMarketplace(zoneId: AdminDashboardZoneId): Prisma.ordersWhereInput {
  return {
    ...notPosWhere,
    ...ordersZoneWhere(zoneId),
  };
}

async function count(where: Prisma.ordersWhereInput): Promise<number> {
  return prisma.orders.count({ where });
}

/**
 * Admin order statistic cards — mirrors PHP `DashboardController::order_stats_calc()`.
 * Subscription-day and schedule-window filters from legacy PHP are omitted (counts may differ slightly).
 */
export async function getAdminDashboardOrderStats(
  zoneId: AdminDashboardZoneId,
  statisticsType: AdminDashboardStatisticsType
): Promise<AdminOrderStats> {
  const base = baseMarketplace(zoneId);

  const searchingBase: Prisma.ordersWhereInput = {
    ...base,
    delivery_man_id: null,
    order_type: 'delivery',
    order_status: { notIn: [...TERMINAL_STATUSES] },
    ...dateFilterOnField('created_at', statisticsType),
  };

  const acceptedBase: Prisma.ordersWhereInput = {
    ...base,
    order_status: 'accepted',
    ...dateFilterOnField('accepted', statisticsType),
  };

  const preparingBase: Prisma.ordersWhereInput = {
    ...base,
    order_status: { in: ['confirmed', 'processing', 'handover'] },
    ...dateFilterOnField('processing', statisticsType),
  };

  const pickedUpBase: Prisma.ordersWhereInput = {
    ...base,
    order_status: 'picked_up',
    ...dateFilterOnField('picked_up', statisticsType),
  };

  const deliveredBase: Prisma.ordersWhereInput = {
    ...base,
    order_status: 'delivered',
    ...dateFilterOnField('delivered', statisticsType),
  };

  const canceledBase: Prisma.ordersWhereInput = {
    ...base,
    order_status: 'canceled',
    ...dateFilterOnField('canceled', statisticsType),
  };

  const refundedBase: Prisma.ordersWhereInput = {
    ...base,
    order_status: 'refunded',
    ...dateFilterOnField('refunded', statisticsType),
  };

  const paymentFailedBase: Prisma.ordersWhereInput =
    statisticsType === 'overall'
      ? { ...base, order_status: 'failed' }
      : {
          ...base,
          order_status: 'refund_requested',
          ...dateFilterOnField('refund_requested', statisticsType),
        };

  const [
    searching_for_dm,
    accepted_by_dm,
    preparing_in_rs,
    picked_up,
    delivered,
    canceled,
    refund_requested,
    refunded,
  ] = await Promise.all([
    count(searchingBase),
    count(acceptedBase),
    count(preparingBase),
    count(pickedUpBase),
    count(deliveredBase),
    count(canceledBase),
    count(paymentFailedBase),
    count(refundedBase),
  ]);

  return {
    searching_for_dm,
    accepted_by_dm,
    preparing_in_rs,
    picked_up,
    delivered,
    canceled,
    refund_requested,
    refunded,
  };
}
