import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import {
  cancelOrderSchema,
  placeOrderSchema,
  PlaceOrderInput,
  trackOrderQuerySchema,
} from '../../schemas/consumer/Order';
import { consumerOrderListQuerySchema } from '../../schemas/consumer/orderList';
import {
  applyOrderListSearchFilter,
  buildConsumerOrderListWhere,
  ConsumerOrderListMode,
  formatConsumerOrderListItem,
  paginationSkip,
  parseFoodImageFromDetail,
  parseDeliveryAddressJson,
  parseOrderIdParam,
  guestContactMatchesOrder,
  CUSTOMER_CANCELABLE_STATUSES,
  formatTrackRestaurant,
  formatTrackDeliveryMan,
  orderStatusLabel,
  resolveConsumerOrderUser,
} from '../../utils/consumer/orderListHelpers';
import { sendNewOrderNotification } from '../../utils/notifications/sendNewOrderNotification';
import { emitNewOrderRealtime, emitOrderStatusRealtime } from '../../sockets/orderRealtime';
import { executePlaceOrder, PlaceOrderError } from './placeOrderLogic';
import { notPosWhere } from '../../utils/vendor/order/query';

function resolveOrderUser(req: Request, payload: PlaceOrderInput): {
  userId: number;
  isGuest: boolean;
} | null {
  if (req.user?.id) {
    return {
      userId: Number(req.user.id),
      isGuest: req.user.isGuest === true || req.user.role === 'guest',
    };
  }
  if (payload.guest_id) {
    return { userId: Number(payload.guest_id), isGuest: true };
  }
  return null;
}

/**
 * @Description Place an order (cart from DB or buy-now payload; pricing validated server-side)
 * @Route POST /api/consumer/order/place
 * @Access Consumer
 */
export const placeOrder = async (req: Request, res: Response): Promise<any> => {
  const payload = req.body;

  const result = placeOrderSchema.validate(payload, { stripUnknown: true });
  if (result.error) {
    return res.status(400).json({
      status: false,
      msg: result.error.details.map((d: any) => d.message).join(','),
    });
  }

  const orderPayload = result.value as PlaceOrderInput;
  const identity = resolveOrderUser(req, orderPayload);
  if (!identity) {
    return res.status(401).json({ status: false, msg: 'Unauthorized' });
  }

  let userProfile: {
    f_name?: string | null;
    l_name?: string | null;
    phone?: string | null;
    email?: string | null;
    wallet_balance?: unknown;
  } | undefined;

  if (!identity.isGuest) {
    userProfile = await prisma.users.findUnique({
      where: { id: BigInt(identity.userId) },
      select: {
        f_name: true,
        l_name: true,
        phone: true,
        email: true,
        wallet_balance: true,
      },
    }) ?? undefined;
  }

  try {
    const placed = await executePlaceOrder({
      payload: orderPayload,
      userId: identity.userId,
      isGuest: identity.isGuest,
      user: userProfile,
    });

    const orderResult = placed.order;
    const mappedOrder = {
      id: orderResult.id.toString(),
      user_id: orderResult.user_id?.toString() || null,
      restaurant_id: orderResult.restaurant_id?.toString() || null,
      order_amount: Number(orderResult.order_amount) || 0,
      delivery_charge: Number(orderResult.delivery_charge) || 0,
      total_tax_amount: Number(orderResult.total_tax_amount) || 0,
      additional_charge: Number(orderResult.additional_charge) || 0,
      dm_tips: Number(orderResult.dm_tips) || 0,
      payment_status: orderResult.payment_status,
      order_status: orderResult.order_status,
      payment_method: orderResult.payment_method,
      order_type: orderResult.order_type,
      scheduled: orderResult.scheduled,
      schedule_at: orderResult.schedule_at,
      created_at: orderResult.created_at,
    };

    const restaurant = await prisma.restaurants.findUnique({
      where: { id: BigInt(Number(orderResult.restaurant_id)) },
      select: { vendor_id: true },
    });
    if (restaurant?.vendor_id) {
      const notifyPayload = {
        order_id: mappedOrder.id,
        restaurant_id: Number(orderResult.restaurant_id),
        vendor_id: Number(restaurant.vendor_id),
        order_type: orderResult.order_type,
        payment_method: orderResult.payment_method,
        order_amount: mappedOrder.order_amount,
      };
      if (orderResult.payment_method === 'digital_payment') {
        // Card checkout is unpaid until HyperPay confirms. Tell the open vendor app now;
        // push + driver pool run from the payment success hook.
        emitNewOrderRealtime(notifyPayload);
      } else {
        void sendNewOrderNotification(notifyPayload);
      }
    }

    return res.status(201).json({
      status: true,
      msg: 'Order placed successfully',
      message: 'Order placed successfully',
      order_id: mappedOrder.id,
      total_ammount: placed.subtotal + placed.taxAdded + placed.delivery_charge,
      data: mappedOrder,
    });
  } catch (e: any) {
    if (e instanceof PlaceOrderError) {
      return res.status(e.statusCode).json({
        status: false,
        msg: e.message,
      });
    }
    if (e.message === 'EMPTY_ORDER') {
      return res.status(403).json({
        status: false,
        msg: 'You cannot place an empty order',
      });
    }
    if (e.message === 'ADDRESS_NOT_FOUND') {
      return res.status(404).json({ status: false, msg: 'Delivery address not found' });
    }
    return res.status(500).json({ status: false, msg: e.message });
  }
};

async function listConsumerOrders(
  req: Request,
  res: Response,
  mode: ConsumerOrderListMode
): Promise<any> {
  const queryResult = consumerOrderListQuerySchema.validate(req.query, { stripUnknown: true });
  if (queryResult.error) {
    return res.status(400).json({
      status: false,
      msg: queryResult.error.details.map((d) => d.message).join(','),
    });
  }

  const { limit, offset, page, guest_id, search } = queryResult.value as {
    limit: number;
    offset: number;
    page?: number;
    guest_id?: number;
    search?: string;
  };
  const pageNum = page ?? offset;

  const identity = resolveConsumerOrderUser(req, res, guest_id);
  if (!identity) return;

  try {
    let where = buildConsumerOrderListWhere(identity.userId, identity.isGuest, mode);
    where = await applyOrderListSearchFilter(where, search, prisma);
    const skip = paginationSkip(limit, pageNum);

    const [total_size, orders] = await Promise.all([
      prisma.orders.count({ where }),
      prisma.orders.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const orderIds = orders.map((o) => Number(o.id));
    const restaurantIds = [...new Set(orders.map((o) => Number(o.restaurant_id)))];

    const [restaurants, details] = await Promise.all([
      restaurantIds.length
        ? prisma.restaurants.findMany({
            where: { id: { in: restaurantIds.map((id) => BigInt(id)) } },
            select: { id: true, name: true, logo: true },
          })
        : [],
      orderIds.length
        ? prisma.order_details.findMany({
            where: { order_id: { in: orderIds } },
            select: { order_id: true, food_id: true, food_details: true },
            orderBy: { id: 'asc' },
          })
        : [],
    ]);

    const thumbByOrderId = new Map<number, string | null>();
    for (const d of details) {
      const oid = Number(d.order_id);
      if (thumbByOrderId.has(oid)) continue;
      thumbByOrderId.set(oid, parseFoodImageFromDetail(d));
    }

    const mappedOrders = orders.map((order) => {
      const restaurant = restaurants.find(
        (r) => Number(r.id) === Number(order.restaurant_id)
      );
      return formatConsumerOrderListItem(
        order,
        restaurant,
        thumbByOrderId.get(Number(order.id)) ?? null,
        mode
      );
    });

    return res.status(200).json({
      status: true,
      msg: 'Success',
      data: {
        total_size,
        limit,
        offset: pageNum,
        page: pageNum,
        orders: mappedOrders,
      },
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
}

/**
 * @Description Figma Orders — Running tab (active orders, Track Order)
 * @Route GET /api/consumer/order/running
 */
export const getRunningOrders = (req: Request, res: Response): Promise<any> =>
  listConsumerOrders(req, res, 'running');

/**
 * @Description Figma Orders — History tab (completed / canceled / refunded)
 * @Route GET /api/consumer/order/history
 */
export const getOrderHistory = (req: Request, res: Response): Promise<any> =>
  listConsumerOrders(req, res, 'history');

/**
 * @Description Figma Orders — Subscription tab
 * @Route GET /api/consumer/order/subscription
 */
export const getSubscriptionOrders = (req: Request, res: Response): Promise<any> =>
  listConsumerOrders(req, res, 'subscription');

/**
 * @Description Track a single order (restaurant, driver, status timeline fields)
 * @Route GET /api/consumer/order/track
 * @Query order_id, guest_id + contact_number (guest)
 */
export const trackOrder = async (req: Request, res: Response): Promise<any> => {
  const validated = trackOrderQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(', '),
    });
  }

  const { order_id, guest_id, contact_number } = validated.value as {
    order_id: string | number;
    guest_id?: number;
    contact_number?: string;
  };

  if (!req.user?.id) {
    if (!guest_id) {
      return res.status(401).json({ status: false, msg: 'Unauthorized' });
    }
    if (!contact_number?.trim()) {
      return res.status(400).json({
        status: false,
        msg: 'contact_number is required for guest orders',
      });
    }
  }

  const identity = resolveConsumerOrderUser(req, res, guest_id);
  if (!identity) return;

  const orderId = parseOrderIdParam(order_id);
  if (!orderId) {
    return res.status(400).json({ status: false, msg: 'Invalid order_id' });
  }

  try {
    const order = await prisma.orders.findFirst({
      where: {
        id: orderId,
        user_id: identity.userId,
        is_guest: identity.isGuest,
        ...notPosWhere,
      },
    });

    if (!order) {
      return res.status(404).json({
        status: false,
        msg: 'Order not found',
      });
    }

    if (identity.isGuest && !guestContactMatchesOrder(order.delivery_address, contact_number!)) {
      return res.status(404).json({
        status: false,
        msg: 'Order not found',
      });
    }

    const restaurantId = Number(order.restaurant_id);
    const dmId =
      order.delivery_man_id != null && Number.isFinite(Number(order.delivery_man_id))
        ? Number(order.delivery_man_id)
        : null;

    const [restaurant, deliveryMan, detailsCount] = await Promise.all([
      prisma.restaurants.findUnique({
        where: { id: BigInt(restaurantId) },
        select: {
          id: true,
          name: true,
          logo: true,
          phone: true,
          address: true,
          latitude: true,
          longitude: true,
        },
      }),
      dmId
        ? prisma.delivery_men.findUnique({
            where: { id: BigInt(dmId) },
            select: {
              id: true,
              f_name: true,
              l_name: true,
              phone: true,
              email: true,
              image: true,
            },
          })
        : Promise.resolve(null),
      prisma.order_details.count({
        where: { order_id: new Prisma.Decimal(orderId.toString()) },
      }),
    ]);

    const delivery_address = parseDeliveryAddressJson(order.delivery_address);

    const payload = {
      id: order.id.toString(),
      user_id: order.user_id?.toString() ?? null,
      restaurant_id: order.restaurant_id?.toString() ?? null,
      order_amount: Number(order.order_amount) || 0,
      delivery_charge: Number(order.delivery_charge) || 0,
      total_tax_amount: Number(order.total_tax_amount) || 0,
      payment_status: order.payment_status,
      order_status: order.order_status,
      status_label: orderStatusLabel(order.order_status),
      payment_method: order.payment_method,
      order_type: order.order_type,
      schedule_at: order.schedule_at,
      scheduled: order.scheduled,
      created_at: order.created_at,
      updated_at: order.updated_at,
      pending: order.pending,
      accepted: order.accepted ?? order.confirmed,
      confirmed: order.confirmed,
      processing: order.processing,
      handover: order.handover,
      picked_up: order.picked_up,
      delivered: order.delivered,
      canceled: order.canceled,
      delivery_address,
      restaurant: formatTrackRestaurant(restaurant),
      delivery_man: formatTrackDeliveryMan(deliveryMan),
      details_count: detailsCount,
      dm_tips: Number(order.dm_tips) || 0,
      delivery_man_id: order.delivery_man_id?.toString() ?? null,
      cancellation_reason: order.cancellation_reason,
      canceled_by: order.canceled_by,
    };

    return res.status(200).json({ status: true, msg: 'Success', data: payload });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Request failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Description Cancel order while pending/failed (customer)
 * @Route PUT /api/consumer/order/cancel
 * @Body order_id, reason, guest_id (guest)
 */
export const cancelOrder = async (req: Request, res: Response): Promise<any> => {
  const validated = cancelOrderSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(', '),
    });
  }

  const { order_id, reason, guest_id } = validated.value as {
    order_id: string | number;
    reason: string;
    guest_id?: number;
  };

  const identity = resolveConsumerOrderUser(req, res, guest_id);
  if (!identity) return;

  const orderId = parseOrderIdParam(order_id);
  if (!orderId) {
    return res.status(400).json({ status: false, msg: 'Invalid order_id' });
  }

  try {
    const order = await prisma.orders.findFirst({
      where: {
        id: orderId,
        user_id: identity.userId,
        is_guest: identity.isGuest,
        ...notPosWhere,
      },
    });

    if (!order) {
      return res.status(404).json({
        status: false,
        msg: 'Order not found',
      });
    }

    if (!CUSTOMER_CANCELABLE_STATUSES.includes(order.order_status as (typeof CUSTOMER_CANCELABLE_STATUSES)[number])) {
      return res.status(403).json({
        status: false,
        msg: 'You cannot cancel after the order is confirmed',
      });
    }

    const now = new Date();
    const updated = await prisma.orders.update({
      where: { id: order.id },
      data: {
        order_status: 'canceled',
        canceled: now,
        cancellation_reason: reason,
        canceled_by: 'customer',
        updated_at: now,
      },
    });

    emitOrderStatusRealtime(updated);

    return res.status(200).json({
      status: true,
      msg: 'Order canceled successfully',
      message: 'Order canceled successfully',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Request failed';
    return res.status(500).json({ status: false, msg });
  }
};
