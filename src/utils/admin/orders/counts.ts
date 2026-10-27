import prisma from '../../../config/database';
import {
  adminManualOrdersBase,
  notDigitalOrderWhere,
  ONGOING_STATUSES,
  orderScheduledInWhere,
  phpScheduledOrderWhere,
  searchingForDmWhere,
} from './filters';
import { notPosWhere } from '../../vendor/order/query';

/** Sidebar badges — aligned with legacy PHP admin `_sidebar.blade.php`. */
export async function getAdminOrderCounts() {
  const base = { ...notPosWhere, ...notDigitalOrderWhere, is_manual_dispatch: false };
  const baseSch = { ...base, ...orderScheduledInWhere() };

  const [
    all,
    scheduled,
    pending,
    accepted,
    processing,
    picked_up,
    delivered,
    canceled,
    failed,
    refunded,
    refund_requested,
    dine_in,
    offline_payments,
    manual,
    searching_dm,
    ongoing,
    subscription,
  ] = await Promise.all([
    prisma.orders.count({ where: base }),
    prisma.orders.count({ where: { ...base, ...phpScheduledOrderWhere() } }),
    prisma.orders.count({ where: { ...baseSch, order_status: 'pending' } }),
    prisma.orders.count({ where: { ...baseSch, order_status: 'accepted' } }),
    prisma.orders.count({
      where: { ...base, order_status: { in: ['confirmed', 'processing', 'handover'] } },
    }),
    prisma.orders.count({ where: { ...baseSch, order_status: 'picked_up' } }),
    prisma.orders.count({ where: { ...base, order_status: 'delivered' } }),
    prisma.orders.count({ where: { ...base, order_status: 'canceled' } }),
    prisma.orders.count({ where: { ...base, order_status: 'failed' } }),
    prisma.orders.count({ where: { ...base, order_status: 'refunded' } }),
    prisma.orders.count({ where: { ...base, order_status: 'refund_requested' } }),
    prisma.orders.count({ where: { ...base, order_type: 'dine_in' } }),
    prisma.orders.count({ where: { ...base, payment_method: 'offline_payment' } }),
    prisma.orders.count({ where: adminManualOrdersBase() }),
    prisma.orders.count({ where: { ...baseSch, ...searchingForDmWhere() } }),
    prisma.orders.count({ where: { ...baseSch, order_status: { in: [...ONGOING_STATUSES] } } }),
    prisma.subscriptions.count(),
  ]);

  return {
    all,
    scheduled,
    pending,
    accepted,
    processing,
    food_on_the_way: picked_up,
    delivered,
    canceled,
    payment_failed: failed,
    refunded,
    dine_in,
    offline_payments,
    manual,
    searching_dm,
    ongoing,
    refund_requested,
    subscription,
  };
}
