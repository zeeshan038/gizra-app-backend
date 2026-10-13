import { Request, Response } from 'express';
import prisma from '../../config/database';
import { sendApiError, joiFirstMessage, errorMessageFromUnknown } from '../../utils/apiErrorResponse';
import {
  cancellationReasonsQuerySchema,
  foodListSchema,
  offlinePaymentSchema,
  offlinePaymentUpdateSchema,
  orderIdQuerySchema,
  refundRequestSchema,
  updatePaymentMethodSchema,
} from '../../schemas/consumer/OrderExtras';
import {
  parseOrderIdParam,
  paginationSkip,
  resolveConsumerOrderUser,
} from '../../utils/consumer/orderListHelpers';
import { notPosWhere } from '../../utils/vendor/order/query';
import { formatRestaurantMenuFood } from '../../utils/consumer/restaurantMenuHelpers';
import {
  DISCOVER_RESTAURANT_SELECT,
  formatDiscoverRestaurant,
  isOpenFromSchedules,
  loadTodaySchedulesByRestaurantId,
} from '../../utils/consumer/restaurantDiscoverHelpers';
import { requireZoneIds } from '../../utils/consumer/zoneHeaders';
import { parseCoordinatesFromRequest } from '../../utils/consumer/favouriteHelpers';
import { distanceKmForRestaurant } from '../../utils/consumer/restaurantDiscoverHelpers';
import {
  getBusinessSettingFlag,
  parseJsonSetting,
} from '../../utils/consumer/businessSettings';
import { sendNewOrderNotification } from '../../utils/notifications/sendNewOrderNotification';
import { emitOrderStatusRealtime } from '../../sockets/orderRealtime';
import { getBusinessSetting } from '../../utils/consumer/businessSettings';

function parseJsonField(raw: string | null | undefined) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function loadOwnedOrder(
  req: Request,
  res: Response,
  orderIdRaw: string | number,
  guestId?: number
) {
  const identity = resolveConsumerOrderUser(req, res, guestId);
  if (!identity) return null;
  const orderId = parseOrderIdParam(orderIdRaw);
  if (!orderId) {
    sendApiError(res, 400, 'Invalid order_id');
    return null;
  }
  const order = await prisma.orders.findFirst({
    where: {
      id: orderId,
      user_id: identity.userId,
      is_guest: identity.isGuest,
      ...notPosWhere,
    },
  });
  if (!order) {
    sendApiError(res, 404, 'Order not found');
    return null;
  }
  return { order, identity };
}

/**
 * @Description Order line items + offline payment snapshot (PHP GET /api/v1/customer/order/details)
 * @Route GET /api/consumer/order/details
 * @Access Consumer
 */
export const getOrderDetails = async (req: Request, res: Response): Promise<any> => {
  const validated = orderIdQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return sendApiError(res, 403, joiFirstMessage(validated.error));
  }
  const { order_id, guest_id } = validated.value as {
    order_id: string | number;
    guest_id?: number;
  };

  try {
    const loaded = await loadOwnedOrder(req, res, order_id, guest_id);
    if (!loaded) return;
    const { order } = loaded;

    const [details, offline] = await Promise.all([
      prisma.order_details.findMany({
        where: { order_id: Number(order.id) },
        orderBy: { id: 'asc' },
      }),
      prisma.offline_payments.findFirst({
        where: { order_id: Number(order.id) },
      }),
    ]);

    if (!details.length) {
      return res.status(200).json({
        status: false,
        errors: [{ code: 'order', message: 'Not found' }],
      });
    }

    const zoneId = order.zone_id != null ? Number(order.zone_id) : null;
    const mapped = details.map((item) => ({
      ...item,
      id: item.id.toString(),
      food_id: item.food_id != null ? String(item.food_id) : null,
      order_id: item.order_id != null ? String(item.order_id) : null,
      price: Number(item.price),
      discount_on_food: item.discount_on_food != null ? Number(item.discount_on_food) : 0,
      tax_amount: Number(item.tax_amount),
      quantity: Number(item.quantity),
      total_add_on_price: Number(item.total_add_on_price),
      add_ons: parseJsonField(item.add_ons),
      variation: parseJsonField(item.variation),
      food_details: parseJsonField(item.food_details),
      zone_id: zoneId,
    }));

    return res.status(200).json({
      status: true,
      details: mapped,
      subscription_schedules: null,
      offline_payment: offline
        ? {
            id: offline.id.toString(),
            order_id: String(offline.order_id),
            status: offline.status,
            customer_note: offline.customer_note,
            payment_info: parseJsonField(offline.payment_info),
            method_fields: parseJsonField(offline.method_fields),
          }
        : null,
    });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Active refund reasons (PHP GET /api/v1/customer/order/refund-reasons)
 * @Route GET /api/consumer/order/refund-reasons
 * @Access Public
 */
export const getRefundReasons = async (_req: Request, res: Response): Promise<any> => {
  try {
    const refund_reasons = await prisma.refund_reasons.findMany({
      where: { status: true },
      orderBy: { id: 'asc' },
    });
    return res.status(200).json({
      status: true,
      refund_reasons: refund_reasons.map((r) => ({
        id: r.id.toString(),
        reason: r.reason,
        status: r.status,
      })),
    });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Customer refund request after delivery (PHP POST /api/v1/customer/order/refund-request)
 * @Route POST /api/consumer/order/refund-request
 * @Access Consumer
 */
export const requestRefund = async (req: Request, res: Response): Promise<any> => {
  if (!(await getBusinessSettingFlag('refund_active_status'))) {
    return sendApiError(res, 403, 'You can not request for a refund');
  }
  const validated = refundRequestSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return sendApiError(res, 403, joiFirstMessage(validated.error));
  }
  const body = validated.value as {
    order_id: string | number;
    customer_reason: string;
    refund_method?: string;
    customer_note?: string;
    image?: string[];
    guest_id?: number;
  };

  try {
    const loaded = await loadOwnedOrder(req, res, body.order_id, body.guest_id);
    if (!loaded) return;
    const { order } = loaded;

    if (order.order_status !== 'delivered' || order.payment_status !== 'paid') {
      return sendApiError(res, 403, 'You can not request for refund after delivery');
    }

    const refundAmount = Math.max(
      0,
      Number(order.order_amount) - Number(order.delivery_charge) - Number(order.dm_tips ?? 0)
    );
    const now = new Date();

    await prisma.$transaction([
      prisma.refunds.create({
        data: {
          order_id: Number(order.id),
          user_id: Number(order.user_id),
          order_status: order.order_status,
          refund_status: 'pending',
          refund_method: body.refund_method ?? 'wallet',
          customer_reason: body.customer_reason,
          customer_note: body.customer_note ?? null,
          refund_amount: refundAmount,
          image: JSON.stringify(body.image ?? []),
          created_at: now,
          updated_at: now,
        },
      }),
      prisma.orders.update({
        where: { id: order.id },
        data: {
          order_status: 'refund_requested',
          refund_requested: now,
          updated_at: now,
        },
      }),
    ]);

    const updated = await prisma.orders.findUnique({ where: { id: order.id } });
    if (updated) emitOrderStatusRealtime(updated);

    return res.status(200).json({
      status: true,
      msg: 'Refund request placed successfully',
      message: 'Refund request placed successfully',
    });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Switch unpaid digital order to cash on delivery (PHP PUT /api/v1/customer/order/payment-method)
 * @Route PUT /api/consumer/order/payment-method
 * @Access Consumer
 */
export const updatePaymentMethod = async (req: Request, res: Response): Promise<any> => {
  const validated = updatePaymentMethodSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return sendApiError(res, 403, joiFirstMessage(validated.error));
  }
  const cod = parseJsonSetting<{ status?: number }>(
    await getBusinessSetting('cash_on_delivery'),
    { status: 1 }
  );
  if (cod?.status === 0) {
    return sendApiError(res, 403, 'Cash on delivery order not available at this time');
  }

  const { order_id, guest_id } = validated.value as {
    order_id: string | number;
    guest_id?: number;
  };

  try {
    const loaded = await loadOwnedOrder(req, res, order_id, guest_id);
    if (!loaded) return;
    const { order } = loaded;
    const now = new Date();
    const updated = await prisma.orders.update({
      where: { id: order.id },
      data: {
        payment_method: 'cash_on_delivery',
        order_status: 'pending',
        pending: now,
        updated_at: now,
      },
    });
    emitOrderStatusRealtime(updated);

    const restaurant = await prisma.restaurants.findUnique({
      where: { id: BigInt(Number(order.restaurant_id)) },
      select: { vendor_id: true },
    });
    if (restaurant?.vendor_id) {
      void sendNewOrderNotification({
        order_id: order.id.toString(),
        restaurant_id: Number(order.restaurant_id),
        vendor_id: Number(restaurant.vendor_id),
        order_type: order.order_type ?? 'delivery',
        payment_method: 'cash_on_delivery',
        order_amount: Number(order.order_amount) || 0,
      });
    }

    return res.status(200).json({
      status: true,
      msg: 'Payment method updated successfully',
      message: 'Payment method updated successfully',
    });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Submit offline payment details for an unpaid order (PHP PUT /api/v1/customer/order/offline-payment)
 * @Route PUT /api/consumer/order/offline-payment
 * @Access Consumer
 */
export const submitOfflinePayment = async (req: Request, res: Response): Promise<any> => {
  const validated = offlinePaymentSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return sendApiError(res, 403, joiFirstMessage(validated.error));
  }
  if (!(await getBusinessSettingFlag('offline_payment_status'))) {
    return sendApiError(res, 403, 'Offline payment for the order not available at this time');
  }

  const { order_id, method_id, customer_note, ...rest } = validated.value as {
    order_id: number;
    method_id: number;
    customer_note?: string;
  } & Record<string, unknown>;

  try {
    const [order, method] = await Promise.all([
      prisma.orders.findUnique({ where: { id: BigInt(order_id) } }),
      prisma.offline_payment_methods.findFirst({
        where: { id: BigInt(method_id), status: 1 },
      }),
    ]);
    if (!order || !method) {
      return sendApiError(res, 403, 'Offline payment order or method not found');
    }

    let fields: Array<{ customer_input?: string }> = [];
    try {
      fields = JSON.parse(method.method_informations) ?? [];
    } catch {
      fields = [];
    }
    const paymentInfo: Record<string, unknown> = {
      method_id,
      method_name: method.method_name,
    };
    for (const field of fields) {
      const key = field.customer_input;
      if (key && key in rest) paymentInfo[key] = rest[key];
    }

    const existing = await prisma.offline_payments.findFirst({
      where: { order_id },
    });
    const now = new Date();
    if (existing) {
      await prisma.offline_payments.update({
        where: { id: existing.id },
        data: {
          payment_info: JSON.stringify(paymentInfo),
          customer_note: customer_note ?? null,
          method_fields: method.method_fields,
          status: 'pending',
          updated_at: now,
        },
      });
    } else {
      await prisma.offline_payments.create({
        data: {
          order_id,
          payment_info: JSON.stringify(paymentInfo),
          customer_note: customer_note ?? null,
          method_fields: method.method_fields,
          status: 'pending',
          created_at: now,
          updated_at: now,
        },
      });
    }

    await prisma.orders.update({
      where: { id: order.id },
      data: { payment_method: 'offline_payment', updated_at: now },
    });

    return res.status(200).json({ status: true, payment: 'success' });
  } catch (e: unknown) {
    return res.status(403).json({ status: false, payment: errorMessageFromUnknown(e) });
  }
};

/**
 * @Description Update previously submitted offline payment info (PHP PUT /api/v1/customer/order/offline-payment-update)
 * @Route PUT /api/consumer/order/offline-payment-update
 * @Access Consumer
 */
export const updateOfflinePaymentInfo = async (req: Request, res: Response): Promise<any> => {
  const validated = offlinePaymentUpdateSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return sendApiError(res, 403, joiFirstMessage(validated.error));
  }
  const { order_id, customer_note, ...rest } = validated.value as {
    order_id: number;
    customer_note?: string;
  } & Record<string, unknown>;

  try {
    const info = await prisma.offline_payments.findFirst({ where: { order_id } });
    const order = await prisma.orders.findUnique({ where: { id: BigInt(order_id) } });
    if (!info || !order) {
      return sendApiError(res, 403, 'Offline payment order or method not found');
    }
    const old = parseJsonField(info.payment_info) as { method_id?: number } | null;
    const methodId = old?.method_id;
    const method = methodId
      ? await prisma.offline_payment_methods.findFirst({ where: { id: BigInt(methodId) } })
      : null;
    if (!method) {
      return sendApiError(res, 403, 'Offline payment method not found');
    }

    let fields: Array<{ customer_input?: string }> = [];
    try {
      fields = JSON.parse(method.method_informations) ?? [];
    } catch {
      fields = [];
    }
    const paymentInfo: Record<string, unknown> = {
      method_id: Number(method.id),
      method_name: method.method_name,
    };
    for (const field of fields) {
      const key = field.customer_input;
      if (key && key in rest) paymentInfo[key] = rest[key];
    }

    await prisma.offline_payments.update({
      where: { id: info.id },
      data: {
        customer_note: customer_note ?? info.customer_note,
        payment_info: JSON.stringify(paymentInfo),
        status: 'pending',
        updated_at: new Date(),
      },
    });
    return res.status(200).json({ status: true, payment: 'Payment_Info_Updated_successfully' });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Cancellation reason list (PHP GET /api/v1/customer/order/cancellation-reasons)
 * @Route GET /api/consumer/order/cancellation-reasons
 * @Access Public
 */
export const getCancellationReasons = async (req: Request, res: Response): Promise<any> => {
  const validated = cancellationReasonsQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return sendApiError(res, 403, joiFirstMessage(validated.error));
  }
  const { limit, offset, type } = validated.value as {
    limit: number;
    offset: number;
    type?: string;
  };
  try {
    const where = {
      status: true,
      ...(type ? { user_type: type } : {}),
    };
    const [total_size, reasons] = await Promise.all([
      prisma.order_cancel_reasons.count({ where }),
      prisma.order_cancel_reasons.findMany({
        where,
        skip: paginationSkip(limit, offset),
        take: limit,
        orderBy: { id: 'asc' },
      }),
    ]);
    return res.status(200).json({
      status: true,
      total_size,
      limit,
      offset,
      reasons: reasons.map((r) => ({
        id: r.id.toString(),
        reason: r.reason,
        user_type: r.user_type,
        is_default: r.is_default,
      })),
    });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Foods by ids for reorder UI (PHP POST /api/v1/customer/food-list)
 * @Route POST /api/consumer/order/food-list
 * @Access Consumer
 */
export const getFoodListByIds = async (req: Request, res: Response): Promise<any> => {
  const validated = foodListSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return sendApiError(res, 403, joiFirstMessage(validated.error));
  }
  let ids: number[] = [];
  const raw = (validated.value as { food_id: string | number[] }).food_id;
  if (Array.isArray(raw)) {
    ids = raw.map(Number).filter((n) => Number.isFinite(n));
  } else {
    try {
      const parsed = JSON.parse(raw);
      ids = (Array.isArray(parsed) ? parsed : [parsed]).map(Number).filter((n) => Number.isFinite(n));
    } catch {
      ids = String(raw)
        .split(',')
        .map((p) => Number(p.trim()))
        .filter((n) => Number.isFinite(n));
    }
  }
  try {
    const foods = await prisma.food.findMany({
      where: { id: { in: ids.map((id) => BigInt(id)) }, status: true },
    });
    return res.status(200).json({
      status: true,
      data: foods.map((f) => formatRestaurantMenuFood(f)),
    });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Items on an order that still need a review (PHP GET /api/v1/customer/getPendingReviews)
 * @Route GET /api/consumer/order/pending-reviews
 * @Access Consumer
 */
export const getPendingReviews = async (req: Request, res: Response): Promise<any> => {
  const validated = orderIdQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return sendApiError(res, 403, joiFirstMessage(validated.error));
  }
  const orderId = parseOrderIdParam(
    (validated.value as { order_id: string | number }).order_id
  );
  if (!orderId) return sendApiError(res, 400, 'Invalid order_id');

  try {
    const details = await prisma.order_details.findMany({
      where: { order_id: Number(orderId) },
      select: {
        id: true,
        food_id: true,
        item_campaign_id: true,
        food_details: true,
      },
    });
    const reviews = await prisma.reviews.findMany({
      where: { order_id: Number(orderId) },
      select: { food_id: true, item_campaign_id: true },
    });
    const reviewedFood = new Set(reviews.map((r) => Number(r.food_id)));
    const reviewedCampaign = new Set(
      reviews
        .map((r) => (r.item_campaign_id != null ? Number(r.item_campaign_id) : NaN))
        .filter((n) => Number.isFinite(n))
    );

    const pending = details.filter((d) => {
      const foodId = d.food_id != null ? Number(d.food_id) : 0;
      const itemId = d.item_campaign_id != null ? Number(d.item_campaign_id) : 0;
      return !reviewedFood.has(foodId) || (itemId > 0 && !reviewedCampaign.has(itemId));
    });

    return res.status(200).json({
      status: true,
      details: pending.map((d) => ({
        id: d.id.toString(),
        food_id: d.food_id != null ? String(d.food_id) : null,
        item_campaign_id: d.item_campaign_id != null ? String(d.item_campaign_id) : null,
        food_details: parseJsonField(d.food_details),
      })),
    });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Restaurants the customer previously ordered from, with reorder foods (PHP GET /api/v1/customer/order-again)
 * @Route GET /api/consumer/order/again
 * @Access Consumer
 */
export const orderAgain = async (req: Request, res: Response): Promise<any> => {
  const zoneIds = requireZoneIds(req, res);
  if (!zoneIds) return;
  const identity = resolveConsumerOrderUser(req, res);
  if (!identity) return;
  const coords = parseCoordinatesFromRequest(req);

  try {
    const recent = await prisma.orders.findMany({
      where: {
        user_id: identity.userId,
        is_guest: false,
        restaurant_id: { not: undefined },
        ...notPosWhere,
      },
      select: { restaurant_id: true },
      distinct: ['restaurant_id'],
      orderBy: { id: 'desc' },
      take: 40,
    });
    const restaurantIds = recent
      .map((o) => Number(o.restaurant_id))
      .filter((id) => Number.isFinite(id));

    if (!restaurantIds.length) {
      return res.status(200).json({ status: true, data: [] });
    }

    const restaurants = await prisma.restaurants.findMany({
      where: {
        id: { in: restaurantIds.map((id) => BigInt(id)) },
        status: true,
        zone_id: { in: zoneIds },
      },
      select: DISCOVER_RESTAURANT_SELECT,
      take: 20,
    });
    const scheduleMap = await loadTodaySchedulesByRestaurantId(restaurants.map((r) => r.id));
    const foods = await prisma.food.findMany({
      where: { restaurant_id: { in: restaurantIds }, status: true },
      orderBy: { order_count: 'desc' },
    });
    const foodsByRestaurant = new Map<number, ReturnType<typeof formatRestaurantMenuFood>[]>();
    for (const food of foods) {
      const rid = Number(food.restaurant_id);
      const list = foodsByRestaurant.get(rid) ?? [];
      if (list.length < 5) list.push(formatRestaurantMenuFood(food));
      foodsByRestaurant.set(rid, list);
    }

    const data = restaurants.map((row) => {
      const open = isOpenFromSchedules(scheduleMap.get(row.id.toString()) ?? []);
      return {
        ...formatDiscoverRestaurant(row, {
          open,
          distanceKm: distanceKmForRestaurant(coords, row.latitude, row.longitude),
        }),
        foods: foodsByRestaurant.get(Number(row.id)) ?? [],
      };
    });
    return res.status(200).json({ status: true, data });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Re-send new-order notification after payment confirmation (PHP GET /api/v1/customer/order/send-notification/{id})
 * @Route POST /api/consumer/order/send-notification/:order_id
 * @Access Consumer
 */
export const sendOrderNotification = async (req: Request, res: Response): Promise<any> => {
  const orderId = parseOrderIdParam(String(req.params.order_id));
  if (!orderId) return sendApiError(res, 400, 'Invalid order_id');
  try {
    const loaded = await loadOwnedOrder(req, res, Number(orderId));
    if (!loaded) return;
    const { order } = loaded;
    const restaurant = await prisma.restaurants.findUnique({
      where: { id: BigInt(Number(order.restaurant_id)) },
      select: { vendor_id: true },
    });
    if (restaurant?.vendor_id) {
      void sendNewOrderNotification({
        order_id: order.id.toString(),
        restaurant_id: Number(order.restaurant_id),
        vendor_id: Number(restaurant.vendor_id),
        order_type: order.order_type ?? 'delivery',
        payment_method: order.payment_method,
        order_amount: Number(order.order_amount) || 0,
      });
    }
    return res.status(200).json({ status: true, reload_home: false });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Most common delivery tip amount (PHP GET /api/v1/most-tips)
 * @Route GET /api/consumer/order/most-tips
 * @Access Public
 */
export const getMostTips = async (_req: Request, res: Response): Promise<any> => {
  try {
    const grouped = await prisma.orders.groupBy({
      by: ['dm_tips'],
      where: { dm_tips: { gt: 0 } },
      _count: { dm_tips: true },
      orderBy: { _count: { dm_tips: 'desc' } },
      take: 1,
    });
    return res.status(200).json({
      status: true,
      most_tips_amount: grouped[0]?.dm_tips ?? 0,
    });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};
