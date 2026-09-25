/**
 * Place-order business logic (ported from Laravel OrderController@place_order).
 * Kept in one module next to the controller — not scattered under utils/.
 */
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import type { PlaceOrderInput } from '../../schemas/consumer/Order';
import {
  getBusinessSetting,
  getBusinessSettingFlag,
  getBusinessSettingNumber,
  parseJsonSetting,
} from '../../utils/consumer/businessSettings';
import { getZoneById } from '../../utils/consumer/zone';


function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Add-on totals from DB (legacy Helpers::calculate_addon_price). */
async function calculateAddonPrice(addOnIds: number[], addOnQtys: number[]) {
  if (!addOnIds.length) {
    return { total_add_on_price: 0, addons: [] as unknown[] };
  }
  const addons = await prisma.add_ons.findMany({
    where: { id: { in: addOnIds.map((id) => BigInt(id)) }, status: true },
  });
  let total = 0;
  const details: unknown[] = [];
  for (let i = 0; i < addOnIds.length; i++) {
    const addon = addons.find((a) => Number(a.id) === addOnIds[i]);
    const qty = addOnQtys[i] ?? 1;
    if (!addon) continue;
    const line = Number(addon.price) * qty;
    total += line;
    details.push({
      id: Number(addon.id),
      name: addon.name,
      price: Number(addon.price),
      quantity: qty,
    });
  }
  return { total_add_on_price: roundMoney(total), addons: details };
}

function computeVariationExtra(
  productVariationsJson: string | null,
  selectedVariations: unknown[]
): number {
  const defs = parseJson<any[]>(productVariationsJson, []);
  if (!defs.length || !selectedVariations?.length) return 0;

  let extra = 0;
  for (const selected of selectedVariations as any[]) {
    const def = defs.find((d) => d.name === selected.name || d.type === selected.name);
    if (!def?.values) continue;
    const values = selected.values ?? selected.options ?? [];
    for (const val of values) {
      const label = typeof val === 'string' ? val : val.label ?? val.name;
      const match = def.values.find((v: any) => v.label === label || v.name === label);
      if (match?.optionPrice != null) extra += Number(match.optionPrice);
      else if (match?.price != null) extra += Number(match.price);
    }
  }
  return extra;
}

function productDiscountAmount(
  food: { discount: unknown; discount_type: string },
  unitPrice: number
): number {
  const discount = Number(food.discount) || 0;
  if (discount <= 0) return 0;
  if (food.discount_type === 'percent') {
    return roundMoney((unitPrice * discount) / 100);
  }
  return roundMoney(Math.min(discount, unitPrice));
}

function orderLevelTax(
  taxableAmount: number,
  taxPercent: number,
  taxIncluded: boolean
): { total_tax_amount: number; tax_to_add: number; tax_status: 'included' | 'excluded' } {
  if (taxPercent <= 0) {
    return { total_tax_amount: 0, tax_to_add: 0, tax_status: taxIncluded ? 'included' : 'excluded' };
  }
  if (taxIncluded) {
    const total_tax_amount = roundMoney((taxableAmount * taxPercent) / (100 + taxPercent));
    return { total_tax_amount, tax_to_add: 0, tax_status: 'included' };
  }
  const total_tax_amount = roundMoney((taxableAmount * taxPercent) / 100);
  return { total_tax_amount, tax_to_add: total_tax_amount, tax_status: 'excluded' };
}

async function getCouponDiscount(params: {
  couponCode?: string;
  userId: number;
  restaurantId: number;
  orderSubtotal: number;
}): Promise<{
  coupon: Awaited<ReturnType<typeof prisma.coupons.findFirst>> | null;
  discount: number;
  error?: string;
}> {
  if (!params.couponCode?.trim()) {
    return { coupon: null, discount: 0 };
  }

  const coupon = await prisma.coupons.findFirst({
    where: { code: params.couponCode.trim(), status: true },
  });
  if (!coupon) {
    return { coupon: null, discount: 0, error: 'Invalid coupon code' };
  }

  const today = new Date();
  if (coupon.start_date && coupon.start_date > today) {
    return { coupon: null, discount: 0, error: 'Coupon not started yet' };
  }
  if (coupon.expire_date && coupon.expire_date < today) {
    return { coupon: null, discount: 0, error: 'Coupon expired' };
  }

  if (Number(coupon.min_purchase) > 0 && params.orderSubtotal < Number(coupon.min_purchase)) {
    return { coupon: null, discount: 0, error: 'Minimum purchase not met for coupon' };
  }

  if (coupon.created_by === 'vendor' && Number(coupon.restaurant_id) !== params.restaurantId) {
    return { coupon: null, discount: 0, error: 'Coupon not valid for this restaurant' };
  }

  let discount = 0;
  if (coupon.discount_type === 'percent') {
    discount = params.orderSubtotal * (Number(coupon.discount) / 100);
  } else {
    discount = Number(coupon.discount);
  }
  if (Number(coupon.max_discount) > 0) {
    discount = Math.min(discount, Number(coupon.max_discount));
  }

  return { coupon, discount: roundMoney(discount) };
}

async function calculateDeliveryFee(params: {
  orderType: string;
  distance: number;
  restaurant: {
    zone_id: unknown;
    free_delivery: boolean;
    self_delivery_system: boolean;
    minimum_shipping_charge: unknown;
    per_km_shipping_charge: number | null;
    maximum_shipping_charge: number | null;
  };
  latitude?: string;
  longitude?: string;
}): Promise<{
  delivery_charge: number;
  original_delivery_charge: number;
  max_cod_order_amount: number;
  error?: string;
}> {
  if (params.orderType === 'take_away' || params.orderType === 'dine_in') {
    return { delivery_charge: 0, original_delivery_charge: 0, max_cod_order_amount: 0 };
  }

  let perKm = Number(params.restaurant.per_km_shipping_charge) || 0;
  let minimum = Number(params.restaurant.minimum_shipping_charge) || 0;
  let maximum = Number(params.restaurant.maximum_shipping_charge) || 0;
  let maxCod = 0;
  let increasedPct = 0;

  if (params.latitude && params.longitude && params.restaurant.zone_id) {
    const zone = await getZoneById(Number(params.restaurant.zone_id));
    if (zone) {
      if (zone.per_km_shipping_charge != null && zone.minimum_shipping_charge != null) {
        perKm = zone.per_km_shipping_charge;
        minimum = zone.minimum_shipping_charge;
        maximum = zone.maximum_shipping_charge ?? maximum;
        maxCod = zone.max_cod_order_amount ?? 0;
      }
      if (zone.increased_delivery_fee_status && zone.increased_delivery_fee) {
        increasedPct = zone.increased_delivery_fee;
      }
    }
  }

  if (params.restaurant.self_delivery_system) {
    perKm = Number(params.restaurant.per_km_shipping_charge) || perKm;
    minimum = Number(params.restaurant.minimum_shipping_charge) || minimum;
    maximum = Number(params.restaurant.maximum_shipping_charge) || maximum;
  }

  let original = params.distance * perKm > minimum ? params.distance * perKm : minimum;
  let delivery = params.distance * perKm > minimum ? params.distance * perKm : minimum;

  if (maximum > minimum && original > maximum) original = maximum;
  if (maximum > minimum && delivery > maximum) delivery = maximum;

  if (increasedPct > 0) {
    original += (original * increasedPct) / 100;
    delivery += (delivery * increasedPct) / 100;
  }

  if (params.restaurant.free_delivery) {
    return {
      delivery_charge: 0,
      original_delivery_charge: roundMoney(original),
      max_cod_order_amount: maxCod,
    };
  }

  return {
    delivery_charge: roundMoney(delivery),
    original_delivery_charge: roundMoney(original),
    max_cod_order_amount: maxCod,
  };
}

async function resolveAdditionalCharge(): Promise<number> {
  const enabled = await getBusinessSettingFlag('additional_charge_status');
  if (!enabled) return 0;
  return getBusinessSettingNumber('additional_charge', 0);
}

async function resolveDmTips(requested: number | undefined): Promise<number> {
  const enabled = await getBusinessSettingFlag('dm_tips_status');
  if (!enabled) return 0;
  return roundMoney(Math.max(0, requested ?? 0));
}

async function applyFreeDeliveryRules(params: {
  productSubtotal: number;
  couponDiscount: number;
  restaurantDiscount: number;
  distance: number;
  restaurant: { free_delivery: boolean; self_delivery_system: boolean; free_delivery_distance: string | null };
}): Promise<{ delivery_charge: number; free_delivery_by: string | null }> {
  let freeBy: string | null = null;
  let charge: number | null = null;

  const freeOver = await getBusinessSettingNumber('free_delivery_over', 0);
  if (freeOver > 0) {
    const sub =
      params.productSubtotal - params.couponDiscount - params.restaurantDiscount;
    if (sub >= freeOver) {
      charge = 0;
      freeBy = 'admin';
    }
  }

  const freeDistance = await getBusinessSettingNumber('free_delivery_distance', 0);
  if (
    freeDistance > 0 &&
    params.restaurant.self_delivery_system === false &&
    params.distance <= freeDistance
  ) {
    charge = 0;
    freeBy = 'admin';
  }

  if (params.restaurant.free_delivery) {
    charge = 0;
    freeBy = 'vendor';
  }

  const restFreeDist = Number(params.restaurant.free_delivery_distance);
  if (
    params.restaurant.self_delivery_system &&
    Number.isFinite(restFreeDist) &&
    restFreeDist > 0 &&
    params.distance <= restFreeDist
  ) {
    charge = 0;
    freeBy = 'vendor';
  }

  return { delivery_charge: charge ?? -1, free_delivery_by: freeBy };
}

async function isTaxIncluded(): Promise<boolean> {
  return getBusinessSettingFlag('tax_included');
}

async function getPaymentSettings() {
  const digital = parseJsonSetting<{ status?: number }>(
    await getBusinessSetting('digital_payment'),
    {}
  );
  const cod = parseJsonSetting<{ status?: number }>(
    await getBusinessSetting('cash_on_delivery'),
    { status: 1 }
  );
  return {
    digitalEnabled: digital.status !== 0,
    codEnabled: cod.status !== 0,
    walletEnabled: await getBusinessSettingFlag('wallet_status'),
    guestCheckoutEnabled: await getBusinessSettingFlag('guest_checkout_status'),
    homeDeliveryEnabled: await getBusinessSettingFlag('home_delivery'),
    takeAwayEnabled: await getBusinessSettingFlag('take_away'),
  };
}


type CartLineInput = {
  item_id: number;
  item_type?: string;
  price?: number;
  quantity: number;
  add_on_ids?: number[];
  add_on_qtys?: number[];
  variations?: unknown[];
  variation_options?: unknown[];
};

type ResolvedCartLine = CartLineInput & {
  cart_id?: bigint;
};

function parseJsonField<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeCartRow(row: {
  id: bigint;
  item_id: unknown;
  item_type: string;
  price: number;
  quantity: bigint;
  add_on_ids: string | null;
  add_on_qtys: string | null;
  variations: string | null;
  variation_options: string | null;
}): ResolvedCartLine {
  return {
    cart_id: row.id,
    item_id: Number(row.item_id),
    item_type: row.item_type,
    price: Number(row.price),
    quantity: Number(row.quantity),
    add_on_ids: parseJsonField<number[]>(row.add_on_ids, []),
    add_on_qtys: parseJsonField<number[]>(row.add_on_qtys, []),
    variations: parseJsonField<unknown[]>(row.variations, []),
    variation_options: parseJsonField<unknown[]>(row.variation_options, []),
  };
}

async function resolveCartLines(params: {
  userId: number;
  isGuest: boolean;
  isBuyNow: boolean;
  cartId?: number;
  inlineCart?: CartLineInput[];
  inlineItems?: CartLineInput[];
}): Promise<ResolvedCartLine[]> {
  const { userId, isGuest, isBuyNow, cartId, inlineCart, inlineItems } = params;

  if (isBuyNow) {
    const source = inlineCart ?? inlineItems ?? [];
    if (!source.length) {
      throw new Error('EMPTY_ORDER');
    }
    return source.map((line) => ({
      ...line,
      quantity: Number(line.quantity),
      item_id: Number(line.item_id),
    }));
  }

  const dbCarts = await prisma.carts.findMany({
    where: {
      user_id: userId,
      is_guest: isGuest,
      ...(cartId ? { id: BigInt(cartId) } : {}),
    },
  });

  if (!dbCarts.length) {
    if (inlineItems?.length) {
      return inlineItems.map((line) => ({
        ...line,
        quantity: Number(line.quantity),
        item_id: Number(line.item_id),
      }));
    }
    throw new Error('EMPTY_ORDER');
  }

  return dbCarts.map(normalizeCartRow);
}

async function clearCartAfterOrder(params: {
  userId: number;
  isGuest: boolean;
  isBuyNow: boolean;
  cartIds: bigint[];
}) {
  if (params.isBuyNow) return;
  if (params.cartIds.length) {
    await prisma.carts.deleteMany({
      where: { id: { in: params.cartIds } },
    });
    return;
  }
  await prisma.carts.deleteMany({
    where: { user_id: params.userId, is_guest: params.isGuest },
  });
}


type DeliveryAddressPayload = {
  contact_person_name?: string;
  contact_person_number?: string;
  contact_person_email?: string;
  address_type?: string;
  address?: string;
  floor?: string;
  road?: string;
  house?: string;
  longitude?: string | number;
  latitude?: string | number;
};

async function buildDeliveryAddressSnapshot(params: {
  userId: number;
  user?: { f_name?: string | null; l_name?: string | null; phone?: string | null; email?: string | null };
  deliveryAddressId?: number;
  inline?: DeliveryAddressPayload;
}): Promise<{ json: string | null; delivery_address_id: number | null }> {
  if (params.deliveryAddressId) {
    const saved = await prisma.customer_addresses.findFirst({
      where: {
        id: BigInt(params.deliveryAddressId),
        user_id: params.userId,
      },
    });
    if (!saved) {
      throw new Error('ADDRESS_NOT_FOUND');
    }
    const snapshot = {
      contact_person_name: saved.contact_person_name ?? '',
      contact_person_number: saved.contact_person_number,
      contact_person_email: params.user?.email ?? '',
      address_type: saved.address_type,
      address: saved.address,
      floor: saved.floor,
      road: saved.road,
      house: saved.house,
      longitude: saved.longitude,
      latitude: saved.latitude,
    };
    return {
      json: JSON.stringify(snapshot),
      delivery_address_id: params.deliveryAddressId,
    };
  }

  if (!params.inline?.address || params.inline.latitude == null || params.inline.longitude == null) {
    return { json: null, delivery_address_id: null };
  }

  const snapshot = {
    contact_person_name:
      params.inline.contact_person_name ??
      [params.user?.f_name, params.user?.l_name].filter(Boolean).join(' ') ??
      '',
    contact_person_number:
      params.inline.contact_person_number ?? params.user?.phone ?? '',
    contact_person_email: params.inline.contact_person_email ?? params.user?.email ?? '',
    address_type: params.inline.address_type ?? 'Delivery',
    address: params.inline.address,
    floor: params.inline.floor ?? '',
    road: params.inline.road ?? '',
    house: params.inline.house ?? '',
    longitude: String(params.inline.longitude),
    latitude: String(params.inline.latitude),
  };

  return { json: JSON.stringify(snapshot), delivery_address_id: null };
}

export class PlaceOrderError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
    public code = 'order_error'
  ) {
    super(message);
  }
}

export async function executePlaceOrder(params: {
  payload: PlaceOrderInput;
  userId: number;
  isGuest: boolean;
  user?: { f_name?: string | null; l_name?: string | null; phone?: string | null; email?: string | null; wallet_balance?: unknown };
}) {
  const { payload, userId, isGuest, user } = params;
  const paymentSettings = await getPaymentSettings();

  if (isGuest && !paymentSettings.guestCheckoutEnabled) {
    throw new PlaceOrderError('Guest checkout is not active', 403, 'is_guest');
  }
  if (payload.order_type === 'delivery' && !paymentSettings.homeDeliveryEnabled) {
    throw new PlaceOrderError('Home delivery is disabled', 403, 'home_delivery');
  }
  if (payload.order_type === 'take_away' && !paymentSettings.takeAwayEnabled) {
    throw new PlaceOrderError('Take away is disabled', 403, 'take_away');
  }
  if (payload.payment_method === 'digital_payment' && !paymentSettings.digitalEnabled) {
    throw new PlaceOrderError('Digital payment is not available', 403, 'digital_payment');
  }
  if (payload.payment_method === 'cash_on_delivery' && !paymentSettings.codEnabled) {
    throw new PlaceOrderError('Cash on delivery is not active', 403, 'order_time');
  }
  if (payload.payment_method === 'wallet' && !paymentSettings.walletEnabled) {
    throw new PlaceOrderError('Wallet payment is disabled', 403, 'payment_method');
  }

  const restaurant = await prisma.restaurants.findUnique({
    where: { id: BigInt(payload.restaurant_id) },
  });
  if (!restaurant || !restaurant.status) {
    throw new PlaceOrderError('Restaurant not found', 403, 'restaurant');
  }

  if (payload.schedule_at) {
    if (!restaurant.schedule_order) {
      throw new PlaceOrderError('Scheduled orders are not available for this restaurant', 403, 'schedule_at');
    }
    const scheduleDate = new Date(payload.schedule_at);
    if (scheduleDate.getTime() < Date.now() - 5 * 60 * 1000) {
      throw new PlaceOrderError('You cannot schedule an order in the past', 403, 'order_time');
    }
  }

  const cartLines = await resolveCartLines({
    userId,
    isGuest,
    isBuyNow: payload.is_buy_now ?? false,
    cartId: payload.cart_id,
    inlineCart: payload.cart,
    inlineItems: payload.items,
  });

  let productPrice = 0;
  let totalAddonPrice = 0;
  let restaurantDiscountAmount = 0;
  const orderDetailsRows: Prisma.order_detailsCreateManyInput[] = [];

  for (const line of cartLines) {
    const food = await prisma.food.findFirst({
      where: { id: BigInt(line.item_id), status: true },
    });
    if (!food) {
      throw new PlaceOrderError('Product unavailable', 404, 'food');
    }
    if (Number(food.restaurant_id) !== payload.restaurant_id) {
      throw new PlaceOrderError('Order food from a single restaurant', 406, 'restaurant');
    }
    if (
      food.maximum_cart_quantity &&
      line.quantity > Number(food.maximum_cart_quantity)
    ) {
      throw new PlaceOrderError('Maximum cart quantity exceeded', 406, 'quantity');
    }

    const variationExtra = computeVariationExtra(food.variations, line.variations ?? []);
    const unitBase = Number(food.price) + variationExtra;
    const discountOnFood = productDiscountAmount(food, unitBase);
    const addonData = await calculateAddonPrice(line.add_on_ids ?? [], line.add_on_qtys ?? []);
    const taxPercent = Number(restaurant.tax) || 0;
    const lineTax = roundMoney(((unitBase - discountOnFood) * taxPercent) / 100);

    productPrice += unitBase * line.quantity;
    totalAddonPrice += addonData.total_add_on_price * line.quantity;
    restaurantDiscountAmount += discountOnFood * line.quantity;

    orderDetailsRows.push({
      food_id: line.item_id,
      price: roundMoney(unitBase),
      quantity: BigInt(line.quantity),
      variation: JSON.stringify(line.variations ?? []),
      add_ons: JSON.stringify(addonData.addons),
      discount_on_food: discountOnFood,
      discount_type: 'discount_on_product',
      tax_amount: lineTax,
      total_add_on_price: addonData.total_add_on_price,
      food_details: JSON.stringify({
        id: Number(food.id),
        name: food.name,
        price: Number(food.price),
        image: food.image,
        restaurant_id: Number(food.restaurant_id),
      }),
      created_at: new Date(),
      updated_at: new Date(),
    });
  }

  const subtotalBeforeCoupon =
    productPrice + totalAddonPrice - restaurantDiscountAmount;

  if (Number(restaurant.minimum_order) > productPrice + totalAddonPrice) {
    throw new PlaceOrderError(
      `Minimum order amount is ${Number(restaurant.minimum_order)}`,
      406,
      'order_amount'
    );
  }

  const couponResult = await getCouponDiscount({
    couponCode: payload.coupon_code,
    userId,
    restaurantId: payload.restaurant_id,
    orderSubtotal: subtotalBeforeCoupon,
  });
  if (couponResult.error) {
    throw new PlaceOrderError(couponResult.error, 403, 'coupon');
  }

  const totalPrice = roundMoney(subtotalBeforeCoupon - couponResult.discount);
  const taxIncluded = await isTaxIncluded();
  const taxPercent = Number(restaurant.tax) || 0;
  const taxResult = orderLevelTax(totalPrice, taxPercent, taxIncluded);

  let deliveryFee = await calculateDeliveryFee({
    orderType: payload.order_type,
    distance: payload.distance ?? 0,
    restaurant,
    latitude: payload.latitude != null ? String(payload.latitude) : undefined,
    longitude: payload.longitude != null ? String(payload.longitude) : undefined,
  });

  if (deliveryFee.error) {
    throw new PlaceOrderError(deliveryFee.error, 403, 'coordinates');
  }

  const freeDelivery = await applyFreeDeliveryRules({
    productSubtotal: productPrice + totalAddonPrice,
    couponDiscount: couponResult.discount,
    restaurantDiscount: restaurantDiscountAmount,
    distance: payload.distance ?? 0,
    restaurant,
  });
  if (freeDelivery.delivery_charge >= 0) {
    deliveryFee = {
      ...deliveryFee,
      delivery_charge: freeDelivery.delivery_charge,
    };
  }

  const additionalCharge = await resolveAdditionalCharge();

  let extraPackaging = 0;
  if (payload.extra_packaging_amount && payload.extra_packaging_amount > 0) {
    const config = await prisma.restaurant_configs.findFirst({
      where: { restaurant_id: Number(restaurant.id) },
    });
    if (config?.is_extra_packaging_active) {
      extraPackaging = Number(config.extra_packaging_amount) || payload.extra_packaging_amount;
    }
  }

  const dmTips = await resolveDmTips(payload.dm_tips);

  let orderAmount = roundMoney(
    totalPrice +
      taxResult.tax_to_add +
      deliveryFee.delivery_charge +
      additionalCharge +
      extraPackaging
  );
  orderAmount = roundMoney(orderAmount + dmTips);

  if (
    payload.payment_method === 'wallet' &&
    user &&
    Number(user.wallet_balance) < orderAmount
  ) {
    throw new PlaceOrderError('Insufficient wallet balance', 203, 'order_amount');
  }

  if (
    payload.payment_method === 'cash_on_delivery' &&
    deliveryFee.max_cod_order_amount > 0 &&
    orderAmount > deliveryFee.max_cod_order_amount
  ) {
    throw new PlaceOrderError(
      `You cannot order more than ${deliveryFee.max_cod_order_amount} on COD`,
      203,
      'order_amount'
    );
  }

  let deliverySnapshot: { json: string | null; delivery_address_id: number | null } = {
    json: null,
    delivery_address_id: null,
  };
  if (payload.order_type === 'delivery') {
    deliverySnapshot = await buildDeliveryAddressSnapshot({
      userId,
      user,
      deliveryAddressId: payload.delivery_address_id,
      inline: {
        contact_person_name: payload.contact_person_name,
        contact_person_number: payload.contact_person_number,
        contact_person_email: payload.contact_person_email,
        address_type: payload.address_type,
        address: payload.address,
        floor: payload.floor,
        road: payload.road,
        house: payload.house,
        latitude: payload.latitude,
        longitude: payload.longitude,
      },
    });
    if (!deliverySnapshot.json) {
      throw new PlaceOrderError('Delivery address is required', 400, 'address');
    }
  }

  const scheduleAt = payload.schedule_at ? new Date(payload.schedule_at) : new Date();
  const scheduled = Boolean(payload.schedule_at && payload.order_type !== 'dine_in');

  let orderStatus = 'pending';
  let paymentStatus = 'unpaid';
  if (payload.payment_method === 'wallet') {
    orderStatus = 'confirmed';
    paymentStatus = 'paid';
  }

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.orders.create({
      data: {
        user_id: userId,
        restaurant_id: payload.restaurant_id,
        order_amount: orderAmount,
        coupon_discount_amount: couponResult.discount,
        coupon_discount_title: couponResult.coupon?.title ?? null,
        coupon_code: payload.coupon_code ?? null,
        coupon_created_by: couponResult.coupon?.created_by ?? null,
        payment_status: paymentStatus,
        order_status: orderStatus,
        total_tax_amount: taxResult.total_tax_amount,
        payment_method: payload.payment_method,
        order_type: payload.order_type,
        delivery_charge: deliveryFee.delivery_charge,
        original_delivery_charge: deliveryFee.original_delivery_charge,
        order_note: payload.order_note ?? null,
        delivery_address_id: deliverySnapshot.delivery_address_id,
        delivery_address: deliverySnapshot.json,
        schedule_at: scheduleAt,
        scheduled,
        restaurant_discount_amount: restaurantDiscountAmount,
        zone_id: restaurant.zone_id != null ? Number(restaurant.zone_id) : null,
        dm_tips: dmTips,
        distance: payload.distance ?? 0,
        tax_status: taxResult.tax_status,
        tax_percentage: taxPercent,
        delivery_instruction: payload.delivery_instruction ?? null,
        unavailable_item_note: payload.unavailable_item_note ?? null,
        cutlery: payload.cutlery ?? false,
        additional_charge: additionalCharge,
        extra_packaging_amount: extraPackaging,
        free_delivery_by: freeDelivery.free_delivery_by,
        is_guest: isGuest,
        checked: payload.payment_method === 'digital_payment',
        otp: String(Math.floor(1000 + Math.random() * 9000)),
        pending: new Date(),
        confirmed: orderStatus === 'confirmed' ? new Date() : null,
        created_at: new Date(),
        updated_at: new Date(),
      },
    });

    const withOrderId = orderDetailsRows.map((row) => ({
      ...row,
      order_id: Number(created.id),
    }));
    await tx.order_details.createMany({ data: withOrderId });

    await tx.restaurants.update({
      where: { id: restaurant.id },
      data: { total_order: { increment: 1 } },
    });

    if (!isGuest) {
      await tx.users.update({
        where: { id: BigInt(userId) },
        data: { zone_id: restaurant.zone_id ?? undefined },
      });
    }

    return created;
  });

  await clearCartAfterOrder({
    userId,
    isGuest,
    isBuyNow: payload.is_buy_now ?? false,
    cartIds: cartLines.map((l) => l.cart_id).filter(Boolean) as bigint[],
  });

  return {
    order,
    orderAmount,
    subtotal: totalPrice,
    taxAdded: taxResult.tax_to_add,
    delivery_charge: deliveryFee.delivery_charge,
  };
}

