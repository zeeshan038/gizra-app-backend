import { order_details, orders, food } from '@prisma/client';
import prisma from '../../../config/database';
import { mapOrderSummary, mapOrderLineItem, OrderCustomerBrief } from './mapper';

export type DeliveryAddressParsed = {
  contact_person_name?: string;
  contact_person_number?: string;
  address?: string;
  road?: string;
  house?: string;
  floor?: string;
  latitude?: string | number;
  longitude?: string | number;
};

export type AddonDisplayLine = {
  name: string;
  quantity: number;
  price: number;
};

/** Legacy orders store JSON on `orders.delivery_address`; new placements may only have `delivery_address_id`. */
export async function resolveOrderDeliveryAddress(order: orders): Promise<string | null> {
  if (order.delivery_address?.trim()) {
    return order.delivery_address;
  }
  if (!order.delivery_address_id) {
    return null;
  }
  const row = await prisma.customer_addresses.findFirst({
    where: { id: BigInt(Number(order.delivery_address_id)) },
  });
  if (!row) return null;
  return JSON.stringify({
    contact_person_name: row.contact_person_name,
    contact_person_number: row.contact_person_number,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    road: row.road,
    house: row.house,
    floor: row.floor,
    address_type: row.address_type,
  });
}

export function parseDeliveryAddress(raw: string | null): DeliveryAddressParsed | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? parsed : null;
  } catch {
    return { address: raw };
  }
}

export function parseAddonLines(raw: string | null): AddonDisplayLine[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((a) => a && typeof a === 'object')
        .map((a) => ({
          name: String(a.name ?? 'Addon'),
          quantity: Number(a.quantity) || 1,
          price: Number(a.price) || 0,
        }));
    }
    return [];
  } catch {
    return [];
  }
}

export function mapOrderDetailLineItem(
  row: order_details,
  foodRow?: Pick<food, 'id' | 'name' | 'image'> | null
) {
  const base = mapOrderLineItem(row, foodRow);
  const addonLines = parseAddonLines(row.add_ons);
  const lineBase = base.price * base.quantity;
  return {
    ...base,
    addon_lines: addonLines,
    line_subtotal: lineBase,
  };
}

export function buildOrderPricing(order: orders, items: ReturnType<typeof mapOrderDetailLineItem>[]) {
  const productPrice = items.reduce((sum, i) => sum + i.line_subtotal, 0);
  const totalAddonPrice = items.reduce((sum, item) => {
    const fromLines = item.addon_lines.reduce((s, a) => s + a.price * a.quantity, 0);
    return sum + (fromLines || item.total_add_on_price || 0);
  }, 0);

  return {
    items_price: productPrice,
    addon_cost: totalAddonPrice,
    subtotal: productPrice + totalAddonPrice,
    restaurant_discount_amount: Number(order.restaurant_discount_amount) || 0,
    coupon_discount_amount: Number(order.coupon_discount_amount) || 0,
    ref_bonus_amount: Number(order.ref_bonus_amount) || 0,
    total_tax_amount: Number(order.total_tax_amount) || 0,
    dm_tips: Number(order.dm_tips) || 0,
    delivery_charge: Number(order.delivery_charge) || 0,
    additional_charge: Number(order.additional_charge) || 0,
    extra_packaging_amount: Number(order.extra_packaging_amount) || 0,
    order_amount: Number(order.order_amount) || 0,
    tax_status: order.tax_status,
  };
}

export type MapLocationPoint = {
  latitude: number;
  longitude: number;
  title: string;
  subtitle?: string | null;
  kind: 'customer' | 'restaurant' | 'delivery_man';
};

export function mapVendorOrderDetail(
  order: orders,
  customer: (OrderCustomerBrief & { orders_count?: number }) | null,
  items: ReturnType<typeof mapOrderDetailLineItem>[],
  restaurant?: {
    name: string;
    address: string | null;
    logo: string | null;
    latitude: string | null;
    longitude: string | null;
  } | null
) {
  const deliveryParsed = parseDeliveryAddress(order.delivery_address);
  const pricing = buildOrderPricing(order, items);

  const map_locations: MapLocationPoint[] = [];

  if (deliveryParsed?.latitude != null && deliveryParsed?.longitude != null) {
    const lat = Number(deliveryParsed.latitude);
    const lng = Number(deliveryParsed.longitude);
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      map_locations.push({
        kind: 'customer',
        latitude: lat,
        longitude: lng,
        title:
          deliveryParsed.contact_person_name ||
          (customer ? [customer.f_name, customer.l_name].filter(Boolean).join(' ') : 'Customer'),
        subtitle: deliveryParsed.address ?? null,
      });
    }
  }

  if (restaurant?.latitude && restaurant?.longitude) {
    const lat = Number(restaurant.latitude);
    const lng = Number(restaurant.longitude);
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      map_locations.push({
        kind: 'restaurant',
        latitude: lat,
        longitude: lng,
        title: restaurant.name,
        subtitle: restaurant.address,
      });
    }
  }

  return {
    ...mapOrderSummary(order, customer),
    customer_email: customer?.email ?? null,
    customer_orders_count: customer?.orders_count ?? 0,
    is_guest: order.is_guest,
    order_note: order.order_note,
    delivery_instruction: order.delivery_instruction,
    unavailable_item_note: order.unavailable_item_note,
    cutlery: order.cutlery,
    edited: order.edited,
    scheduled: order.scheduled,
    schedule_at: order.schedule_at,
    delivery_address: order.delivery_address,
    delivery_address_parsed: deliveryParsed,
    delivery_charge: pricing.delivery_charge,
    total_tax_amount: pricing.total_tax_amount,
    order_proof: order.order_proof,
    cancellation_reason: order.cancellation_reason,
    cancellation_note: order.cancellation_note,
    canceled_by: order.canceled_by,
    pricing,
    items,
    restaurant: restaurant
      ? {
          name: restaurant.name,
          address: restaurant.address,
          logo: restaurant.logo,
          latitude: restaurant.latitude,
          longitude: restaurant.longitude,
        }
      : null,
    map_locations,
  };
}
