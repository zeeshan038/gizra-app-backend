import prisma from '../../../config/database';
import { adminOrdersListBase, buildAdminOrderStatusFilter } from './filters';
import { buildAdminOrderSearchFilter } from './searchFilter';
import { mapAdminOrderListRow } from './mapOrderRow';

export type AdminListOrdersParams = {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
  manualOnly?: boolean;
  dispatchStatus?: string | null;
  refundStatus?: string | null;
};

export async function listAdminOrders(params: AdminListOrdersParams) {
  const {
    status = 'all',
    search,
    limit = 50,
    offset = 0,
    manualOnly = false,
    dispatchStatus,
    refundStatus,
  } = params;

  const searchWhere = await buildAdminOrderSearchFilter(search);
  const where = {
    ...adminOrdersListBase({ manualOnly, dispatchStatus }),
    ...buildAdminOrderStatusFilter(status, { dispatchStatus, refundStatus, manualOnly }),
    ...searchWhere,
  };

  // PHP marks unchecked orders as seen when opening order lists
  await prisma.orders.updateMany({
    where: { checked: false, ...notPosOnly() },
    data: { checked: true },
  });

  const [total, rows] = await Promise.all([
    prisma.orders.count({ where }),
    prisma.orders.findMany({
      where,
      orderBy: [{ schedule_at: 'desc' }, { id: 'desc' }],
      skip: offset,
      take: Math.min(Math.max(limit, 1), 100),
    }),
  ]);

  const restaurantIds = [...new Set(rows.map((r) => Number(r.restaurant_id)))];
  const userIds = [
    ...new Set(rows.map((r) => (r.user_id != null ? Number(r.user_id) : null)).filter(Boolean)),
  ] as number[];

  const [restaurants, users] = await Promise.all([
    restaurantIds.length
      ? prisma.restaurants.findMany({
          where: { id: { in: restaurantIds.map((id) => BigInt(id)) } },
          select: { id: true, name: true },
        })
      : [],
    userIds.length
      ? prisma.users.findMany({
          where: { id: { in: userIds.map((id) => BigInt(id)) } },
          select: { id: true, f_name: true, l_name: true, phone: true },
        })
      : [],
  ]);

  const restaurantById = new Map(restaurants.map((r) => [Number(r.id), r.name]));
  const userById = new Map(users.map((u) => [Number(u.id), u]));

  const orders = rows.map((order) => {
    const uid = order.user_id != null ? Number(order.user_id) : null;
    const customer = uid != null ? userById.get(uid) ?? null : null;
    const restaurantName = restaurantById.get(Number(order.restaurant_id)) ?? '—';
    return mapAdminOrderListRow(order, restaurantName, customer);
  });

  return { orders, total };
}

function notPosOnly() {
  return { order_type: { not: 'pos' } as const };
}
