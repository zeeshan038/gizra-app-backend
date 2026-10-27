import { food, order_details, orders } from '@prisma/client';
import prisma from '../../config/database';
import { publicRestaurantMediaUrl } from '../mediaStorage';
import {
  buildOrderPricing,
  mapOrderDetailLineItem,
  parseDeliveryAddress,
  resolveOrderDeliveryAddress,
} from '../vendor/order/detailMapper';
import { formatCustomerName, OrderCustomerBrief } from '../vendor/order/mapper';
import { parseJsonObject } from '../vendor/restaurantSetup/helpers';

export type OrderInvoicePayload = {
  order_id: string;
  created_at: string | null;
  order_type: string | null;
  order_status: string | null;
  payment_method: string | null;
  payment_status: string | null;
  order_note: string | null;
  delivery_instruction: string | null;
  cutlery: boolean;
  table_number: string | null;
  token_number: string | null;
  restaurant: {
    id: string;
    name: string;
    address: string | null;
    phone: string | null;
    logo: string | null;
    gst_status: boolean;
    gst_code: string;
    footer_text: string | null;
  };
  customer: {
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    road: string | null;
    house: string | null;
    floor: string | null;
  };
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    variation: string | null;
    addons: Array<{ name: string; quantity: number; price: number }>;
  }>;
  pricing: ReturnType<typeof buildOrderPricing>;
};

function parseGst(raw: string | null | undefined): { gst_status: boolean; gst_code: string } {
  const gst = parseJsonObject(raw);
  return {
    gst_status: Boolean(Number(gst.status) || 0),
    gst_code: gst.code != null ? String(gst.code) : '',
  };
}

export async function buildOrderInvoice(
  order: orders,
  options?: { restaurantId?: number }
): Promise<OrderInvoicePayload | null> {
  if (options?.restaurantId != null && Number(order.restaurant_id) !== options.restaurantId) {
    return null;
  }

  const restaurantId = Number(order.restaurant_id);
  const [details, restaurant, orderRef, customer] = await Promise.all([
    prisma.order_details.findMany({ where: { order_id: Number(order.id) } }),
    prisma.restaurants.findUnique({
      where: { id: BigInt(restaurantId) },
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        logo: true,
        gst: true,
        footer_text: true,
      },
    }),
    prisma.order_references.findFirst({
      where: { order_id: Number(order.id) },
      select: { table_number: true, token_number: true },
    }),
    order.user_id
      ? prisma.users.findUnique({
          where: { id: BigInt(Number(order.user_id)) },
          select: { f_name: true, l_name: true, phone: true, email: true },
        })
      : Promise.resolve(null),
  ]);

  if (!restaurant) return null;

  const foodIds = details
    .map((d) => (d.food_id != null ? Number(d.food_id) : null))
    .filter((id): id is number => id != null);

  const foods: Pick<food, 'id' | 'name' | 'image'>[] = foodIds.length
    ? await prisma.food.findMany({
        where: { id: { in: foodIds.map((id) => BigInt(id)) } },
        select: { id: true, name: true, image: true },
      })
    : [];
  const foodById = new Map(foods.map((f) => [Number(f.id), f]));

  const lineItems = details.map((row: order_details) => {
    const foodRow = row.food_id != null ? foodById.get(Number(row.food_id)) : null;
    return mapOrderDetailLineItem(row, foodRow);
  });

  const deliveryRaw = await resolveOrderDeliveryAddress(order);
  const delivery = parseDeliveryAddress(deliveryRaw);
  const gst = parseGst(restaurant.gst);
  const customerBrief = customer as OrderCustomerBrief | null;
  const pricing = buildOrderPricing(order, lineItems);

  const guestName = delivery?.contact_person_name?.trim() || null;
  const guestPhone = delivery?.contact_person_number?.trim() || null;

  return {
    order_id: order.id.toString(),
    created_at: order.created_at?.toISOString() ?? null,
    order_type: order.order_type,
    order_status: order.order_status,
    payment_method: order.payment_method,
    payment_status: order.payment_status,
    order_note: order.order_note,
    delivery_instruction: order.delivery_instruction,
    cutlery: Boolean(order.cutlery),
    table_number: orderRef?.table_number ?? null,
    token_number: orderRef?.token_number ?? null,
    restaurant: {
      id: restaurant.id.toString(),
      name: restaurant.name,
      address: restaurant.address,
      phone: restaurant.phone,
      logo: publicRestaurantMediaUrl(restaurant.logo, 'logo'),
      gst_status: gst.gst_status,
      gst_code: gst.gst_code,
      footer_text: restaurant.footer_text,
    },
    customer: {
      name: guestName || formatCustomerName(customerBrief),
      phone: guestPhone || customerBrief?.phone || null,
      email: customerBrief?.email ?? null,
      address: delivery?.address ?? null,
      road: delivery?.road ?? null,
      house: delivery?.house ?? null,
      floor: delivery?.floor ?? null,
    },
    items: lineItems.map((item) => ({
      id: item.id,
      name: item.food_name,
      quantity: item.quantity,
      unit_price: item.price,
      line_total:
        item.line_subtotal + item.addon_lines.reduce((s, a) => s + a.price * a.quantity, 0),
      variation: item.variation,
      addons: item.addon_lines,
    })),
    pricing,
  };
}
