import { Prisma } from '@prisma/client';
import { notPosWhere } from '../../vendor/order/query';
import {
  buildAdminOrderScopeFilters,
  ONGOING_STATUSES,
  orderScheduledInWhere,
  phpScheduledOrderWhere,
  searchingForDmWhere,
} from './orderScopeHelpers';

/** PHP Order::scopeNotDigitalOrder */
export const notDigitalOrderWhere: Prisma.ordersWhereInput = {
  OR: [
    { payment_method: { notIn: ['digital_payment', 'offline_payment'] } },
    { order_status: { not: 'pending' } },
  ],
};

/** Regular admin order list (excludes POS, unpaid digital pending, manual dispatch). */
export function adminOrdersBase(manualOnly: boolean): Prisma.ordersWhereInput {
  return {
    ...notPosWhere,
    ...notDigitalOrderWhere,
    is_manual_dispatch: manualOnly,
  };
}

/** PHP dispatch_list — Notpos only, no NotDigitalOrder. */
export function adminDispatchOrdersBase(): Prisma.ordersWhereInput {
  return {
    ...notPosWhere,
    is_manual_dispatch: false,
  };
}

/** PHP manual_list — manual dispatch only (includes POS / digital pending). */
export function adminManualOrdersBase(): Prisma.ordersWhereInput {
  return { is_manual_dispatch: true };
}

export function adminOrdersListBase(opts: {
  manualOnly: boolean;
  dispatchStatus?: string | null;
}): Prisma.ordersWhereInput {
  if (opts.manualOnly) return adminManualOrdersBase();
  if (opts.dispatchStatus) return adminDispatchOrdersBase();
  return adminOrdersBase(false);
}

export function buildAdminOrderStatusFilter(
  status: string,
  opts: {
    dispatchStatus?: string | null;
    refundStatus?: string | null;
    manualOnly?: boolean;
  } = {}
): Prisma.ordersWhereInput {
  return buildAdminOrderScopeFilters(status, opts);
}

export { ONGOING_STATUSES, orderScheduledInWhere, phpScheduledOrderWhere, searchingForDmWhere };
