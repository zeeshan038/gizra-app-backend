import prisma from '../../../config/database';
import { notPosWhere } from '../../vendor/order/query';
import {
  buildOrderPricing,
  mapOrderDetailLineItem,
  parseDeliveryAddress,
  resolveOrderDeliveryAddress,
} from '../../vendor/order/detailMapper';
import { formatCustomerName } from '../../vendor/order/mapper';
import { publicMediaUrl } from '../../mediaStorage';
import { publicRestaurantMediaUrl } from '../../mediaStorage';

function foodImageUrl(image: string | null | undefined) {
  const raw = image?.trim();
  if (!raw) return null;
  const path = raw.includes('/') ? raw : `product/${raw}`;
  return publicMediaUrl(path);
}

export async function getAdminOrderDetail(orderId: number) {
  const order = await prisma.orders.findFirst({
    where: { id: BigInt(orderId), ...notPosWhere },
  });
  if (!order) return null;

  const [details, restaurant, customer, deliveryMan] = await Promise.all([
    prisma.order_details.findMany({ where: { order_id: Number(order.id) } }),
    prisma.restaurants.findUnique({
      where: { id: BigInt(Number(order.restaurant_id)) },
      select: { id: true, name: true, logo: true, phone: true, zone_id: true },
    }),
    order.user_id
      ? prisma.users.findUnique({
          where: { id: BigInt(Number(order.user_id)) },
          select: { f_name: true, l_name: true, phone: true, email: true },
        })
      : null,
    order.delivery_man_id
      ? prisma.delivery_men.findUnique({
          where: { id: BigInt(Number(order.delivery_man_id)) },
          select: { f_name: true, l_name: true, phone: true },
        })
      : null,
  ]);

  const foodIds = details
    .map((d) => (d.food_id != null ? Number(d.food_id) : null))
    .filter((id): id is number => id != null);

  const foods =
    foodIds.length > 0
      ? await prisma.food.findMany({
          where: { id: { in: foodIds.map((id) => BigInt(id)) } },
          select: { id: true, name: true, image: true },
        })
      : [];
  const foodById = new Map(foods.map((f) => [Number(f.id), f]));

  const lineItems = details.map((row) => {
    const foodRow = row.food_id != null ? foodById.get(Number(row.food_id)) : null;
    const mapped = mapOrderDetailLineItem(row, foodRow);
    return {
      id: mapped.id,
      name: mapped.food_name,
      quantity: mapped.quantity,
      price: mapped.price,
      food_image: foodImageUrl(mapped.food_image),
      variation: mapped.variation,
      addon_lines: mapped.addon_lines,
    };
  });

  const pricingRaw = buildOrderPricing(order, lineItems.map((i, idx) => {
    const d = details[idx];
    const foodRow = d.food_id != null ? foodById.get(Number(d.food_id)) : null;
    return mapOrderDetailLineItem(d, foodRow);
  }));

  const deliveryRaw = await resolveOrderDeliveryAddress(order);
  const delivery_address_parsed = parseDeliveryAddress(deliveryRaw);

  return {
    id: order.id.toString(),
    created_at: order.created_at?.toISOString() ?? null,
    customer_name: formatCustomerName(customer),
    customer_phone: customer?.phone ?? null,
    customer_email: customer?.email ?? null,
    restaurant_id: order.restaurant_id.toString(),
    restaurant_name: restaurant?.name ?? '—',
    restaurant_logo: publicRestaurantMediaUrl(restaurant?.logo, 'logo'),
    restaurant_phone: restaurant?.phone ?? null,
    order_amount: Number(order.order_amount) || 0,
    payment_status: order.payment_status,
    payment_method: order.payment_method,
    order_status: order.order_status,
    order_type: order.order_type,
    is_manual_dispatch: order.is_manual_dispatch,
    delivery_man_id: order.delivery_man_id?.toString() ?? null,
    delivery_man_name: deliveryMan
      ? [deliveryMan.f_name, deliveryMan.l_name].filter(Boolean).join(' ')
      : null,
    zone_id: order.zone_id?.toString() ?? null,
    order_note: order.order_note,
    delivery_address_parsed,
    pricing: {
      items: pricingRaw.items_price,
      addon: pricingRaw.addon_cost,
      subtotal: pricingRaw.subtotal,
      discount: Number(order.restaurant_discount_amount) || 0,
      coupon_discount: Number(order.coupon_discount_amount) || 0,
      vat: Number(order.total_tax_amount) || 0,
      delivery_charge: Number(order.delivery_charge) || 0,
      total: Number(order.order_amount) || 0,
    },
    items: lineItems,
  };
}
