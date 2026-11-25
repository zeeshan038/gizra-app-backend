import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';
import { mapOrderLineItem } from '../../vendor/order/mapper';
import { parseDeliveryAddress } from '../../vendor/order/detailMapper';

export type PosWebhookEvent = 'order.created' | 'order.updated' | 'order.cancelled';

export async function buildPosOrderWebhookPayload(input: {
  event: PosWebhookEvent;
  eventId: string;
  orderId: bigint;
  restaurantId: number;
  externalMerchantId: string | null;
  provider: string;
}) {
  const order = await prisma.orders.findUnique({
    where: { id: input.orderId },
  });
  if (!order) return null;

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

  const address = parseDeliveryAddress(order.delivery_address);

  return {
    event: input.event,
    event_id: input.eventId,
    occurred_at: new Date().toISOString(),
    provider: input.provider,
    restaurant_id: String(input.restaurantId),
    external_merchant_id: input.externalMerchantId,
    order: {
      id: order.id.toString(),
      restaurant_order_ref: order.restaurant_order_ref ?? null,
      order_status: order.order_status,
      order_type: order.order_type,
      payment_method: order.payment_method,
      payment_status: order.payment_status,
      order_amount: Number(order.order_amount) || 0,
      delivery_charge: Number(order.delivery_charge) || 0,
      total_tax_amount: Number(order.total_tax_amount) || 0,
      order_note: order.order_note ?? null,
      delivery_instruction: order.delivery_instruction ?? null,
      scheduled: Boolean(order.scheduled),
      schedule_at: order.schedule_at?.toISOString?.() ?? null,
      created_at: order.created_at?.toISOString?.() ?? null,
      delivery_address: address,
      items: details.map((row) => {
        const foodId = row.food_id != null ? Number(row.food_id) : null;
        const foodRow = foodId != null ? foodById.get(foodId) ?? null : null;
        return mapOrderLineItem(row, foodRow);
      }),
    },
  };
}
