import { delivery_men, order_details, orders, food } from '@prisma/client';
import prisma from '../../../config/database';
import { ORDER_PRICE_TOLERANCE, resolveUnitFoodPrice } from '../../consumer/orderLinePricing';
import { mapOrderSummary, mapOrderLineItem, OrderCustomerBrief } from './mapper';
import {
  deriveOrderValueFromOrder,
  GIZRA_COMMISSION_PERCENT,
  gizraCommissionOnFood,
  gizraPaysRestaurant,
} from './orderSettlement';
import { publicMediaUrl } from '../../mediaStorage';
import { mapOrderCookingTimeForApi } from './cookingTime';
import { mapOrderIdentityFields } from '../../order/orderIdentity';

export type OrderAssignedDeliveryManRow = Pick<
  delivery_men,
  'id' | 'f_name' | 'l_name' | 'phone' | 'email' | 'image'
>;

export type NotifiedDeliveryManBrief = {
  id: string;
  name: string;
  phone: string;
  image: string | null;
  current_orders: number;
};

export function formatOrderAssignedDeliveryMan(
  order: orders,
  deliveryMan?: OrderAssignedDeliveryManRow | null
) {
  const delivery_man_id = order.delivery_man_id?.toString() ?? null;
  if (!delivery_man_id) {
    return {
      delivery_man_id: null,
      delivery_man_name: null,
      delivery_man_phone: null,
      delivery_man: null,
      driver_accepted_at: null,
    };
  }

  const delivery_man_name = deliveryMan
    ? [deliveryMan.f_name, deliveryMan.l_name].filter(Boolean).join(' ') || 'Delivery man'
    : null;

  return {
    delivery_man_id,
    delivery_man_name,
    delivery_man_phone: deliveryMan?.phone ?? null,
    delivery_man: deliveryMan
      ? {
          id: deliveryMan.id.toString(),
          name: delivery_man_name ?? 'Delivery man',
          phone: deliveryMan.phone,
          email: deliveryMan.email ?? null,
          image_url: publicMediaUrl(deliveryMan.image),
        }
      : null,
    driver_accepted_at: order.accepted?.toISOString?.() ?? null,
  };
}

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

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function catalogFoodBaseFromDetails(row: order_details): number | null {
  if (!row.food_details?.trim()) return null;
  try {
    const parsed = JSON.parse(row.food_details);
    if (!parsed || typeof parsed !== 'object') return null;
    const base = Number((parsed as { price?: unknown }).price);
    return Number.isFinite(base) ? base : null;
  } catch {
    return null;
  }
}

/** Per-unit add-on total (sum of add-on line prices for one food unit). */
export function addonPerUnitFromDetail(
  row: order_details,
  addonLines?: AddonDisplayLine[]
): number {
  const lines = addonLines ?? parseAddonLines(row.add_ons);
  const fromLines = lines.reduce((s, a) => s + roundMoney(a.price * a.quantity), 0);
  if (fromLines > 0) return roundMoney(fromLines);
  return roundMoney(Number(row.total_add_on_price) || 0);
}

/**
 * Food + variation unit price stored on order_details.price.
 * Some legacy rows bundle add-ons into `price`; subtract them so add-ons are not counted twice.
 */
export function unitFoodPriceFromDetail(row: order_details, addonPerUnit: number): number {
  const stored = roundMoney(Number(row.price) || 0);
  const catalogBase = catalogFoodBaseFromDetails(row);
  let serverUnitBase =
    catalogBase != null && Number.isFinite(catalogBase)
      ? roundMoney(catalogBase)
      : stored;
  if (
    addonPerUnit > 0 &&
    stored > serverUnitBase + addonPerUnit - ORDER_PRICE_TOLERANCE
  ) {
    serverUnitBase = roundMoney(stored - addonPerUnit);
  }

  const asFoodFromStored = roundMoney(stored - addonPerUnit);
  if (
    addonPerUnit > 0 &&
    catalogBase != null &&
    Math.abs(stored - catalogBase) <= ORDER_PRICE_TOLERANCE &&
    Math.abs(stored - catalogBase - addonPerUnit) > ORDER_PRICE_TOLERANCE &&
    Math.abs(stored - asFoodFromStored - addonPerUnit) <= ORDER_PRICE_TOLERANCE
  ) {
    serverUnitBase = asFoodFromStored;
  }

  /**
   * Checkout stores food+variations in `price` with add-ons in `add_ons`.
   * When stored equals catalog+addon by coincidence (e.g. 23 = 19+4) but stored > catalog,
   * do not strip add-ons from the unit food price.
   */
  if (
    addonPerUnit > 0 &&
    catalogBase != null &&
    stored > catalogBase + ORDER_PRICE_TOLERANCE &&
    Math.abs(stored - catalogBase - addonPerUnit) <= ORDER_PRICE_TOLERANCE
  ) {
    return stored;
  }

  return resolveUnitFoodPrice({
    linePrice: stored,
    serverUnitBase,
    addonPerUnit,
  });
}

export function mapOrderDetailLineItem(
  row: order_details,
  foodRow?: Pick<food, 'id' | 'name' | 'image'> | null
) {
  const base = mapOrderLineItem(row, foodRow);
  const addon_lines = parseAddonLines(row.add_ons);
  const addon_per_unit = addonPerUnitFromDetail(row, addon_lines);
  const unit_food_price = unitFoodPriceFromDetail(row, addon_per_unit);
  const quantity = base.quantity;
  const line_food_total = roundMoney(unit_food_price * quantity);
  const line_addon_total = roundMoney(addon_per_unit * quantity);
  const line_subtotal = roundMoney(line_food_total + line_addon_total);

  return {
    ...base,
    /** Food + variations only (excludes add-ons). */
    price: unit_food_price,
    unit_food_price,
    addon_per_unit,
    addon_lines,
    line_food_total,
    line_addon_total,
    line_subtotal,
  };
}

export function buildOrderPricing(order: orders, items: ReturnType<typeof mapOrderDetailLineItem>[]) {
  let productPrice = items.reduce((sum, i) => sum + i.line_food_total, 0);
  let totalAddonPrice = items.reduce((sum, i) => sum + i.line_addon_total, 0);

  /** Manual dispatch (Request Gizra driver) has no order_details — derive from order totals. */
  if (roundMoney(productPrice + totalAddonPrice) === 0) {
    const fromOrder = deriveOrderValueFromOrder(order);
    if (fromOrder > 0) {
      productPrice = fromOrder;
      totalAddonPrice = 0;
    }
  }

  const restaurant_discount_amount = Number(order.restaurant_discount_amount) || 0;
  const coupon_discount_amount = Number(order.coupon_discount_amount) || 0;
  const ref_bonus_amount = Number(order.ref_bonus_amount) || 0;
  const discountTotal = roundMoney(
    restaurant_discount_amount + coupon_discount_amount + ref_bonus_amount
  );

  /** Gross food + add-ons from line items (POS breakdown: Items + Add-ons). */
  let subtotal = roundMoney(productPrice + totalAddonPrice);

  /** Items + addons after order-level discounts (restaurant order value — delivery excluded). */
  let order_value = roundMoney(subtotal - discountTotal);

  /** Legacy rows: add-ons were counted in both `price` and `add_ons`. */
  const derivedFromStoredTotals = deriveOrderValueFromOrder(order);
  if (derivedFromStoredTotals > 0 && order_value > derivedFromStoredTotals + 0.02) {
    const overshoot = roundMoney(order_value - derivedFromStoredTotals);
    if (
      totalAddonPrice > 0 &&
      Math.abs(overshoot - totalAddonPrice) <= 0.05
    ) {
      productPrice = roundMoney(Math.max(0, productPrice - totalAddonPrice));
      subtotal = roundMoney(productPrice + totalAddonPrice);
      order_value = roundMoney(subtotal - discountTotal);
    }
  }

  const total_tax_amount = Number(order.total_tax_amount) || 0;
  const delivery_charge = Number(order.delivery_charge) || 0;
  const dm_tips = Number(order.dm_tips) || 0;
  const additional_charge = Number(order.additional_charge) || 0;
  const extra_packaging_amount = Number(order.extra_packaging_amount) || 0;
  const order_amount = Number(order.order_amount) || 0;

  const gizra_commission_amount = gizraCommissionOnFood(order_value);
  const gizra_pays_you = gizraPaysRestaurant(order_value);

  /** Customer → restaurant (food) + rider (delivery). Gizra fee is not on this total. */
  const customer_pays_food = order_value;
  const delivery_rider_amount = delivery_charge;
  const customer_tax_amount = total_tax_amount;
  const customer_tax_percent = Number(order.tax_percentage) || 0;

  const customer_tax_added =
    order.tax_status === 'included' ? 0 : customer_tax_amount;
  const customer_order_total_computed = roundMoney(
    order_value +
      customer_tax_added +
      delivery_charge +
      dm_tips +
      additional_charge +
      extra_packaging_amount
  );
  /** Amount charged at checkout (`orders.order_amount`). */
  const customer_order_total =
    order_amount > 0 ? order_amount : customer_order_total_computed;

  /** Food + delivery the customer pays (excludes Gizra commission; VAT may be in order_amount). */
  const customer_paid_food_delivery = roundMoney(order_value + delivery_charge);
  const restaurant_list_total = customer_paid_food_delivery;

  return {
    items_price: productPrice,
    addon_cost: totalAddonPrice,
    subtotal,
    order_value,
    /** @deprecated use order_value */
    food_amount_after_discounts: order_value,
    restaurant_discount_amount,
    coupon_discount_amount,
    ref_bonus_amount,
    customer_tax_amount,
    customer_tax_percent,
    total_tax_amount: customer_tax_amount,
    gizra_commission_amount,
    gizra_commission_percent: GIZRA_COMMISSION_PERCENT,
    /** @deprecated use gizra_commission_amount — not customer VAT */
    tax_on_order_value: gizra_commission_amount,
    gizra_commission: gizra_commission_amount,
    /** @deprecated use customer_tax_percent — was mislabeled as 10% platform fee */
    tax_percent_on_order: customer_tax_percent,
    customer_pays_food,
    delivery_rider_amount,
    restaurant_list_total,
    customer_paid_food_delivery,
    customer_order_total,
    /** @deprecated use customer_order_total */
    order_amount: customer_order_total,
    stored_order_amount: order_amount,
    dm_tips,
    delivery_charge,
    additional_charge,
    extra_packaging_amount,
    gizra_pays_you,
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

function manualDispatchPlaceholderItem(
  order: orders,
  restaurant?: { logo: string | null } | null
): ReturnType<typeof mapOrderDetailLineItem> {
  const itemSubtotal = deriveOrderValueFromOrder(order);
  return {
    id: 'manual-dispatch',
    food_id: null,
    food_name: 'Manual dispatch (phone order)',
    food_image: restaurant?.logo ?? null,
    price: itemSubtotal,
    quantity: 1,
    variation: null,
    add_ons: null,
    tax_amount: Number(order.total_tax_amount) || 0,
    total_add_on_price: 0,
    unit_food_price: itemSubtotal,
    addon_per_unit: 0,
    addon_lines: [],
    line_food_total: itemSubtotal,
    line_addon_total: 0,
    line_subtotal: itemSubtotal,
  };
}

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
  } | null,
  extras?: {
    deliveryMan?: OrderAssignedDeliveryManRow | null;
    notified_delivery_men?: NotifiedDeliveryManBrief[];
    zone_name?: string | null;
  }
) {
  const deliveryParsed = parseDeliveryAddress(order.delivery_address);
  const displayItems =
    items.length === 0 && order.is_manual_dispatch
      ? [manualDispatchPlaceholderItem(order, restaurant)]
      : items;
  const pricing = buildOrderPricing(order, displayItems);

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

  const assignedDriver = formatOrderAssignedDeliveryMan(order, extras?.deliveryMan);
  const cookingTime = mapOrderCookingTimeForApi(order);

  return {
    ...mapOrderSummary(order, customer),
    order_value: pricing.order_value,
    restaurant_list_total: pricing.restaurant_list_total,
    gizra_pays_you: pricing.gizra_pays_you,
    order_amount: pricing.customer_order_total,
    ...assignedDriver,
    ...cookingTime,
    notified_delivery_men: extras?.notified_delivery_men ?? [],
    zone_name: extras?.zone_name ?? null,
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
    is_manual_dispatch: Boolean(order.is_manual_dispatch),
    ...mapOrderIdentityFields(order),
    items: displayItems,
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
