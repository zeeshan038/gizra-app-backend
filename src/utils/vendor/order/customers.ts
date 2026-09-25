//Config
import prisma from '../../../config/database';
import { orders } from '@prisma/client';

//Utils
import { OrderCustomerBrief } from './mapper';

const customerSelect = {
  id: true,
  f_name: true,
  l_name: true,
  phone: true,
} as const;

export type CustomerWithId = OrderCustomerBrief & { id: bigint };

export async function loadCustomersByUserIds(userIds: number[]): Promise<CustomerWithId[]> {
  if (!userIds.length) return [];
  return prisma.users.findMany({
    where: { id: { in: userIds.map((id) => BigInt(id)) } },
    select: customerSelect,
  });
}

export function findCustomerForOrder(
  order: orders,
  customers: CustomerWithId[]
): OrderCustomerBrief | null {
  if (!order.user_id) return null;
  const match = customers.find((c) => Number(c.id) === Number(order.user_id));
  if (!match) return null;
  const { id: _id, ...rest } = match;
  return rest;
}

export async function loadCustomersForOrders(ordersList: orders[]) {
  const userIds = [...new Set(ordersList.map((o) => Number(o.user_id)).filter(Boolean))];
  return loadCustomersByUserIds(userIds);
}
