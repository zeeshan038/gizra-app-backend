import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';
import { mapOrderLineItem, mapOrderSummary } from '../../vendor/order/mapper';
import { findCustomerForOrder, loadCustomersForOrders } from '../../vendor/order/customers';
import { parseDeliveryAddress } from '../../vendor/order/detailMapper';

export async function getPosOrderDetail(orderId: bigint, restaurantId: number) {
  const order = await prisma.orders.findFirst({
    where: {
      id: orderId,
      restaurant_id: new Prisma.Decimal(restaurantId),
    },
  });
  if (!order) return null;

  const customers = await loadCustomersForOrders([order]);
  const customer = findCustomerForOrder(order, customers);
  const details = await prisma.order_details.findMany({
    where: { order_id: new Prisma.Decimal(order.id.toString()) },
  });

  const foodIds = details
    .map((d) => (d.food_id != null ? Number(d.food_id) : null))
    .filter((id): id is number => id != null && Number.isFinite(id));
  const foods =
    foodIds.length > 0
      ? await prisma.food.findMany({
          where: { id: { in: foodIds.map((id) => BigInt(id)) } },
          select: { id: true, name: true, image: true },
        })
      : [];
  const foodById = new Map(foods.map((f) => [Number(f.id), f]));

  return {
    ...mapOrderSummary(order, customer),
    restaurant_order_ref: order.restaurant_order_ref ?? null,
    order_note: order.order_note ?? null,
    delivery_instruction: order.delivery_instruction ?? null,
    delivery_address: parseDeliveryAddress(order.delivery_address),
    items: details.map((row) => {
      const foodId = row.food_id != null ? Number(row.food_id) : null;
      return mapOrderLineItem(row, foodId != null ? foodById.get(foodId) ?? null : null);
    }),
  };
}
