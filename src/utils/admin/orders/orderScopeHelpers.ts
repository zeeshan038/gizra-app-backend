import { Prisma } from '@prisma/client';

export const ADMIN_ORDER_SCHEDULE_WINDOW_MINUTES = 30;

/** PHP Admin OrderController — statuses that do not get OrderScheduledIn(30). */
const NO_SCHEDULE_WINDOW_STATUSES = new Set([
  'all',
  'scheduled',
  'canceled',
  'refund_requested',
  'refunded',
  'delivered',
  'failed',
  'payment_failed',
  'dine_in',
]);

/**
 * Approximation of PHP Order::scopeOrderScheduledIn($interval).
 * ASAP orders (scheduled=false) are always included; scheduled orders appear when due or within the window.
 */
export function orderScheduledInWhere(
  intervalMinutes = ADMIN_ORDER_SCHEDULE_WINDOW_MINUTES
): Prisma.ordersWhereInput {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + intervalMinutes * 60_000);

  return {
    OR: [
      { scheduled: false },
      {
        AND: [
          { scheduled: true },
          {
            OR: [{ schedule_at: { lte: now } }, { schedule_at: { gte: now, lte: windowEnd } }],
          },
        ],
      },
    ],
  };
}

/** PHP Order::scopeScheduled — future/scheduled orders (not ASAP). */
export function phpScheduledOrderWhere(): Prisma.ordersWhereInput {
  return { scheduled: true };
}

export function adminOrderListNeedsScheduleWindow(
  status: string,
  opts: { dispatchStatus?: string | null; refundStatus?: string | null; manualOnly?: boolean } = {}
): boolean {
  if (opts.dispatchStatus) return true;
  if (opts.refundStatus === 'requested' || opts.refundStatus === 'refunded') return false;
  if (NO_SCHEDULE_WINDOW_STATUSES.has(status)) return false;
  return true;
}

export function buildAdminOrderScopeFilters(
  status: string,
  opts: {
    dispatchStatus?: string | null;
    refundStatus?: string | null;
    manualOnly?: boolean;
  } = {}
): Prisma.ordersWhereInput {
  const statusFilter = buildStatusOnlyFilter(status, opts);
  if (!adminOrderListNeedsScheduleWindow(status, opts)) {
    return statusFilter;
  }
  return { AND: [statusFilter, orderScheduledInWhere()] };
}

/** Status predicates only (no schedule window). */
function buildStatusOnlyFilter(
  status: string,
  opts: {
    dispatchStatus?: string | null;
    refundStatus?: string | null;
  }
): Prisma.ordersWhereInput {
  const { dispatchStatus, refundStatus } = opts;

  if (dispatchStatus === 'searching_for_deliverymen') {
    return searchingForDmWhere();
  }
  if (dispatchStatus === 'on_going') {
    return { order_status: { in: [...ONGOING_STATUSES] } };
  }
  if (refundStatus === 'requested') {
    return { order_status: 'refund_requested' };
  }
  if (refundStatus === 'refunded') {
    return { order_status: 'refunded' };
  }
  if (refundStatus === 'rejected') {
    return { order_status: 'refund_request_canceled' };
  }

  switch (status) {
    case 'all':
      return {};
    case 'scheduled':
      return phpScheduledOrderWhere();
    case 'pending':
      return { order_status: 'pending' };
    case 'accepted':
      return { order_status: 'accepted' };
    case 'processing':
      return { order_status: { in: ['confirmed', 'processing', 'handover'] } };
    case 'food_on_the_way':
      return { order_status: 'picked_up' };
    case 'delivered':
      return { order_status: 'delivered' };
    case 'canceled':
      return { order_status: 'canceled' };
    case 'payment_failed':
    case 'failed':
      return { order_status: 'failed' };
    case 'refunded':
      return { order_status: 'refunded' };
    case 'dine_in':
      return { order_type: 'dine_in' };
    case 'offline_payments':
      return { payment_method: 'offline_payment' };
    default:
      return { order_status: status };
  }
}

const TERMINAL_STATUSES = [
  'delivered',
  'failed',
  'canceled',
  'refund_requested',
  'refund_request_canceled',
  'refunded',
] as const;

export const ONGOING_STATUSES = [
  'accepted',
  'confirmed',
  'processing',
  'handover',
  'picked_up',
] as const;

export function searchingForDmWhere(): Prisma.ordersWhereInput {
  return {
    delivery_man_id: null,
    order_type: 'delivery',
    order_status: { notIn: [...TERMINAL_STATUSES] },
  };
}
