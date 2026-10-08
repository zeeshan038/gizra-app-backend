import { delivery_men, orders } from '@prisma/client';
import prisma from '../../config/database';
import { orderStatusLabel } from '../consumer/orderListHelpers';
import { publicMediaUrl } from '../mediaStorage';
import {
  buildOrderPricing,
  mapOrderDetailLineItem,
  parseDeliveryAddress,
  resolveOrderDeliveryAddress,
} from '../vendor/order/detailMapper';
import { formatCustomerName } from '../vendor/order/mapper';
import {
  buildLatestOrderStatusFilter,
  getBusinessSetting,
  getEligibleRestaurantIdsForDm,
  passesNotDigitalPending,
  passesScheduleWindow,
  passesVehicleFilter,
} from './orderHelpers';

const DEFAULT_RESTAURANT_IMAGE = 'default_logo.png';
const DEFAULT_CUSTOMER_IMAGE = 'def.png';
const DEFAULT_FOOD_IMAGE = 'def.png';

function mediaUrl(stored: string | null | undefined, fallback: string): string {
  const raw = stored?.trim() || fallback;
  return publicMediaUrl(raw) ?? raw;
}

function formatUnitLabel(variation: string | null): string {
  if (!variation?.trim()) return 'Plate';
  try {
    const parsed = JSON.parse(variation);
    if (Array.isArray(parsed) && parsed[0]?.type) return String(parsed[0].type);
    if (parsed && typeof parsed === 'object' && 'type' in parsed) {
      return String((parsed as { type?: string }).type);
    }
  } catch {
    /* plain text */
  }
  return variation.trim().slice(0, 40) || 'Plate';
}

function addressSnippet(parsed: ReturnType<typeof parseDeliveryAddress>): string | null {
  if (!parsed) return null;
  const parts = [parsed.address, parsed.road, parsed.house, parsed.floor].filter(Boolean);
  return parts.join(', ') || null;
}

export async function deliveryManCanViewOrder(
  dm: delivery_men,
  order: orders
): Promise<boolean> {
  if (order.order_type === 'pos') return false;

  if (order.delivery_man_id != null) {
    return Number(order.delivery_man_id) === Number(dm.id);
  }

  const restaurantIds = await getEligibleRestaurantIdsForDm(dm);
  const inRestaurantList = restaurantIds.includes(Number(order.restaurant_id));
  const zoneMatch =
    dm.type === 'zone_wise' &&
    dm.zone_id != null &&
    order.zone_id != null &&
    Number(order.zone_id) === Number(dm.zone_id);
  if (!inRestaurantList && !zoneMatch) {
    return false;
  }

  const orderConfirmationModel =
    (await getBusinessSetting('order_confirmation_model')) ??
    process.env.ORDER_CONFIRMATION_MODEL ??
    'restaurant';

  const statusFilter = buildLatestOrderStatusFilter(dm.type, orderConfirmationModel);
  const allowedStatuses =
    'order_status' in statusFilter && statusFilter.order_status
      ? (statusFilter.order_status as { in?: string[] }).in
      : null;

  if (allowedStatuses?.length) {
    if (!allowedStatuses.includes(order.order_status)) return false;
  } else if ('OR' in statusFilter && Array.isArray(statusFilter.OR)) {
    const ok = statusFilter.OR.some((clause) => {
      if (!clause || typeof clause !== 'object') return false;
      if ('order_status' in clause) {
        const st = clause.order_status as string | { in?: string[] };
        if (typeof st === 'string') return order.order_status === st;
        if (st?.in) return st.in.includes(order.order_status);
      }
      return false;
    });
    if (!ok) return false;
  }

  const dmVehicleId = dm.vehicle_id != null ? Number(dm.vehicle_id) : null;
  return (
    passesScheduleWindow(order, 30) &&
    passesVehicleFilter(order, dmVehicleId, dm.type) &&
    passesNotDigitalPending(order)
  );
}

export async function buildDeliveryManOrderDetail(
  order: orders,
  dm: delivery_men
): Promise<Record<string, unknown>> {
  const deliveryAddressRaw = (await resolveOrderDeliveryAddress(order)) ?? order.delivery_address;
  const deliveryParsed = parseDeliveryAddress(deliveryAddressRaw);
  const orderForPricing = deliveryAddressRaw
    ? { ...order, delivery_address: deliveryAddressRaw }
    : order;

  const restaurant = await prisma.restaurants.findUnique({
    where: { id: BigInt(Number(order.restaurant_id)) },
      select: {
      id: true,
      name: true,
      phone: true,
      address: true,
      logo: true,
      cover_photo: true,
      latitude: true,
      longitude: true,
      vendor_id: true,
    },
  });

  let customerUser: {
    f_name: string | null;
    l_name: string | null;
    phone: string | null;
    image: string | null;
  } | null = null;

  if (order.user_id) {
    customerUser = await prisma.users.findUnique({
      where: { id: BigInt(Number(order.user_id)) },
      select: { f_name: true, l_name: true, phone: true, image: true },
    });
  }

  const customerName =
    deliveryParsed?.contact_person_name?.trim() ||
    formatCustomerName(customerUser) ||
    'Customer';
  const customerPhone =
    deliveryParsed?.contact_person_number?.trim() || customerUser?.phone || null;

  const details = await prisma.order_details.findMany({
    where: { order_id: Number(order.id) },
    orderBy: { id: 'asc' },
  });

  const foodIds = details.map((d) => Number(d.food_id)).filter(Boolean);
  const foods = foodIds.length
    ? await prisma.food.findMany({
        where: { id: { in: foodIds.map((id) => BigInt(id)) } },
        select: { id: true, name: true, image: true },
      })
    : [];

  const mappedDetailRows = details.map((row) => {
    const foodRow = foods.find((f) => Number(f.id) === Number(row.food_id));
    return mapOrderDetailLineItem(row, foodRow);
  });

  const pricing = buildOrderPricing(orderForPricing, mappedDetailRows);

  let lineItems: Array<{
    id: string | null;
    food_id: string | null;
    food_name: string;
    food_image: string | null;
    food_image_url: string;
    quantity: number;
    unit_label: string;
    price: number;
    line_total: number;
    addon_lines: { name: string; quantity: number; price: number }[];
    tax_amount: number;
  }> = mappedDetailRows.map((mapped) => ({
    id: mapped.id,
    food_id: mapped.food_id,
    food_name: mapped.food_name,
    food_image: mapped.food_image,
    food_image_url: mediaUrl(mapped.food_image, DEFAULT_FOOD_IMAGE),
    quantity: mapped.quantity,
    unit_label: formatUnitLabel(mapped.variation),
    price: mapped.price,
    line_total: mapped.line_subtotal,
    addon_lines: mapped.addon_lines,
    tax_amount: mapped.tax_amount,
  }));

  if (lineItems.length === 0 && order.is_manual_dispatch) {
    const deliveryFee = Number(order.delivery_charge) || 0;
    const tax = Number(order.total_tax_amount) || 0;
    const total = Number(order.order_amount) || 0;
    const itemSubtotal = Math.max(0, Math.round((total - deliveryFee - tax) * 100) / 100);
    lineItems = [
      {
        id: null,
        food_id: null,
        food_name: 'Manual Dispatch delivery request',
        food_image: null,
        food_image_url: mediaUrl(restaurant?.logo ?? restaurant?.cover_photo, DEFAULT_FOOD_IMAGE),
        quantity: 1,
        unit_label: '',
        price: itemSubtotal,
        line_total: itemSubtotal,
        addon_lines: [],
        tax_amount: tax,
      },
    ];
  }

  const itemsPriceFromLines = lineItems.reduce((sum, row) => sum + row.line_total, 0);
  const itemsPrice =
    itemsPriceFromLines > 0 ? itemsPriceFromLines : pricing.items_price;

  const discountTotal =
    pricing.restaurant_discount_amount + pricing.coupon_discount_amount + pricing.ref_bonus_amount;

  const taxBase = itemsPrice + pricing.addon_cost;
  const taxPercent =
    taxBase > 0 ? Math.round((pricing.total_tax_amount / taxBase) * 1000) / 10 : 0;

  const assigned = order.delivery_man_id != null;
  const isAssignedToMe = assigned && Number(order.delivery_man_id) === Number(dm.id);

  const restaurantImageStored =
    restaurant?.logo?.trim() || restaurant?.cover_photo?.trim() || DEFAULT_RESTAURANT_IMAGE;

  const vendorId =
    restaurant?.vendor_id != null ? Number(restaurant.vendor_id).toString() : null;

  return {
    id: order.id.toString(),
    user_id: order.user_id != null ? Number(order.user_id).toString() : null,
    vendor_id: vendorId,
    order_status: order.order_status,
    status_label: orderStatusLabel(order.order_status),
    payment_status: order.payment_status,
    payment_method: order.payment_method,
    order_type: order.order_type,
    order_amount: pricing.order_amount,
    delivery_charge: pricing.delivery_charge,
    scheduled: order.scheduled,
    schedule_at: order.schedule_at?.toISOString() ?? null,
    created_at: order.created_at?.toISOString() ?? null,
    is_manual_dispatch: Boolean(order.is_manual_dispatch),
    order_note: order.order_note,
    dispatch_summary: order.is_manual_dispatch
      ? {
          title: 'Manual Dispatch delivery request',
          delivery_fee: pricing.delivery_charge,
        }
      : null,
    restaurant: restaurant
      ? {
          id: Number(restaurant.id).toString(),
          name: restaurant.name,
          phone: restaurant.phone,
          address: restaurant.address,
          address_snippet: restaurant.address,
          latitude: restaurant.latitude,
          longitude: restaurant.longitude,
          image_url: mediaUrl(restaurantImageStored, DEFAULT_RESTAURANT_IMAGE),
        }
      : null,
    customer: {
      name: customerName,
      phone: customerPhone,
      address: deliveryParsed?.address ?? null,
      address_snippet: addressSnippet(deliveryParsed),
      latitude: deliveryParsed?.latitude ?? null,
      longitude: deliveryParsed?.longitude ?? null,
      image_url: mediaUrl(customerUser?.image, DEFAULT_CUSTOMER_IMAGE),
    },
    delivery_address: deliveryAddressRaw,
    delivery_address_parsed: deliveryParsed,
    items: lineItems,
    pricing: {
      items_price: itemsPrice,
      discount: discountTotal,
      vat_tax: pricing.total_tax_amount,
      tax_percent: taxPercent,
      delivery_man_tips: pricing.dm_tips,
      addons: pricing.addon_cost,
      delivery_charge: pricing.delivery_charge,
      subtotal: pricing.order_amount,
    },
    assigned_to_me: isAssignedToMe,
    can_accept: !assigned && (await deliveryManCanViewOrder(dm, order)),
    can_update_status: isAssignedToMe,
  };
}
