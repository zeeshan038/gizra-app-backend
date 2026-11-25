import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';
import { mapOrderSummary } from '../../vendor/order/mapper';
import { findCustomerForOrder, loadCustomersForOrders } from '../../vendor/order/customers';

export async function listPosOrders(input: {
  restaurantId: number;
  status?: string;
  limit: number;
  offset: number;
  updated_since?: Date;
}) {
  const where: Prisma.ordersWhereInput = {
    restaurant_id: new Prisma.Decimal(input.restaurantId),
  };
  if (input.status && input.status !== 'all') {
    where.order_status = input.status;
  }
  if (input.updated_since) {
    where.updated_at = { gte: input.updated_since };
  }

  const [total, rows] = await Promise.all([
    prisma.orders.count({ where }),
    prisma.orders.findMany({
      where,
      orderBy: { id: 'desc' },
      take: input.limit,
      skip: input.offset,
    }),
  ]);

  const customers = await loadCustomersForOrders(rows);
  return {
    total,
    limit: input.limit,
    offset: input.offset,
    data: rows.map((order) => mapOrderSummary(order, findCustomerForOrder(order, customers))),
  };
}
