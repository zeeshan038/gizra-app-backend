import { Request, Response } from 'express';
import prisma from '../../config/database';
import { dmMyOrdersQuerySchema, dmUpdateOrderStatusSchema } from '../../schemas/deliveryman/Order';
import { emitOrderStatusRealtime } from '../../sockets/orderRealtime';
import {
  createOrderTransactionIfNeeded,
  ORDER_SETTLEMENT_TX_OPTIONS,
  OrderSettlementError,
} from '../../utils/order/createOrderTransaction';
import {
  buildLatestOrderStatusFilter,
  DM_ACTIVE_ORDER_STATUSES,
  getBusinessSetting,
  getEligibleRestaurantIdsForDm,
  mapOrdersForDeliveryManList,
  passesNotDigitalPending,
  passesScheduleWindow,
  passesVehicleFilter,
  requireDmIdFromRequest,
} from '../../utils/deliveryman/orderHelpers';
import {
  buildDeliveryManMyOrdersWhere,
  mapMyOrdersForDeliveryMan,
} from '../../utils/deliveryman/myOrdersHelpers';
import {
  buildDeliveryManOrderDetail,
  deliveryManCanViewOrder,
} from '../../utils/deliveryman/orderDetailMapper';
import {
  applyOrderListSearchFilter,
  paginationSkip,
} from '../../utils/consumer/orderListHelpers';

/**
 * @Description Active (current) orders assigned to the delivery man — home card / My Orders
 * @Route GET /api/delivery-man/orders/active
 * @Access Private (Delivery Man)
 */
export const getActiveOrders = async (req: Request, res: Response): Promise<any> => {
  const deliveryManId = requireDmIdFromRequest(req);
  if (deliveryManId == null) {
    return res.status(401).json({ status: false, msg: 'Unauthorized' });
  }

  try {
    const orders = await prisma.orders.findMany({
      where: {
        delivery_man_id: deliveryManId,
        order_status: { in: [...DM_ACTIVE_ORDER_STATUSES] },
        order_type: { not: 'pos' },
      },
      orderBy: [{ accepted: 'desc' }, { schedule_at: 'desc' }, { id: 'desc' }],
    });

    const data = await mapOrdersForDeliveryManList(orders);
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Request failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Description My Orders — completed / past deliveries (Figma list)
 * @Route GET /api/delivery-man/orders/history
 * @Access Private (Delivery Man)
 */
export const getMyOrders = async (req: Request, res: Response): Promise<any> => {
  const deliveryManId = requireDmIdFromRequest(req);
  if (deliveryManId == null) {
    return res.status(401).json({ status: false, msg: 'Unauthorized' });
  }

  const validated = dmMyOrdersQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(','),
    });
  }

  const { limit, offset, page, search } = validated.value as {
    limit: number;
    offset: number;
    page?: number;
    search?: string;
  };
  const pageNum = page ?? offset;

  try {
    let where = buildDeliveryManMyOrdersWhere(deliveryManId);
    where = await applyOrderListSearchFilter(where, search, prisma);

    const skip = paginationSkip(limit, pageNum);

    const [total_size, orders] = await Promise.all([
      prisma.orders.count({ where }),
      prisma.orders.findMany({
        where,
        orderBy: [{ schedule_at: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
      }),
    ]);

    const list = await mapMyOrdersForDeliveryMan(orders);

    return res.status(200).json({
      status: true,
      msg: 'Success',
      data: {
        total_size,
        limit,
        offset: pageNum,
        orders: list,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Request failed';
    return res.status(500).json({ status: false, msg });
  }
};


/**
 * @Description Order detail for request / active delivery screens (restaurant, customer, items, pricing)
 * @Route GET /api/delivery-man/orders/:id
 * @Access Private (Delivery Man)
 */
export const getOrderDetails = async (req: Request, res: Response): Promise<any> => {
  const deliveryManId = requireDmIdFromRequest(req);
  const orderIdParam = String(req.params.id ?? '').trim();

  if (deliveryManId == null) {
    return res.status(401).json({ status: false, msg: 'Unauthorized' });
  }

  if (!orderIdParam || !/^\d+$/.test(orderIdParam)) {
    return res.status(400).json({ status: false, msg: 'Order id required' });
  }

  try {
    const dm = await prisma.delivery_men.findUnique({
      where: { id: BigInt(deliveryManId) },
    });
    if (!dm) {
      return res.status(404).json({ status: false, msg: 'Delivery man not found' });
    }

    const order = await prisma.orders.findUnique({
      where: { id: BigInt(orderIdParam) },
    });

    if (!order || order.order_type === 'pos') {
      return res.status(404).json({ status: false, msg: 'Order not found' });
    }

    const canView = await deliveryManCanViewOrder(dm, order);
    if (!canView) {
      return res.status(403).json({ 
        status: false, msg: 'You cannot view this order' });
    }

    const data = await buildDeliveryManOrderDetail(order, dm);
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Request failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Description Unassigned orders in the driver's zone (order request pool)
 * @Route GET /api/delivery-man/orders/latest
 * @Access Private (Delivery Man)
 */
export const getLatestOrders = async (req: Request, res: Response): Promise<any> => {
  const deliveryManId = requireDmIdFromRequest(req);
  if (deliveryManId == null) {
    return res.status(401).json({ status: false, msg: 'Unauthorized' });
  }

  try {
    const dm = await prisma.delivery_men.findUnique({
      where: { id: BigInt(deliveryManId) },
    });

    if (!dm) {
      return res.status(404).json({ status: false, msg: 'Delivery man not found' });
    }

    const restaurantIds = await getEligibleRestaurantIdsForDm(dm);
    if (restaurantIds.length === 0) {
      return res.status(200).json({ status: true, msg: 'Success', data: [] });
    }

    const orderConfirmationModel =
      (await getBusinessSetting('order_confirmation_model')) ??
      process.env.ORDER_CONFIRMATION_MODEL ??
      'restaurant';

    const statusFilter = buildLatestOrderStatusFilter(dm.type, orderConfirmationModel);
    const dmVehicleId = dm.vehicle_id != null ? Number(dm.vehicle_id) : null;

    const candidates = await prisma.orders.findMany({
      where: {
        ...statusFilter,
        delivery_man_id: null,
        order_type: 'delivery',
        restaurant_id: { in: restaurantIds },
      },
      orderBy: [{ schedule_at: 'desc' }, { id: 'desc' }],
      take: 100,
    });

    const filtered = candidates.filter(
      (order) =>
        passesScheduleWindow(order, 30) &&
        passesVehicleFilter(order, dmVehicleId) &&
        passesNotDigitalPending(order)
    );

    const data = await mapOrdersForDeliveryManList(filtered);
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Request failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Description Accept an order from the broadcast pool
 * @Route PUT /api/delivery-man/orders/:id/accept
 * @Access Private (Delivery Man)
 */
export const acceptOrder = async (req: Request, res: Response): Promise<any> => {
  const deliveryManId = requireDmIdFromRequest(req);
  const order_id = req.params.id;

  if (deliveryManId == null) {
    return res.status(401).json({ status: false, msg: 'Unauthorized' });
  }

  try {
    const dm = await prisma.delivery_men.findUnique({
      where: { id: BigInt(deliveryManId) },
    });
    if (!dm) {
      return res.status(404).json({ status: false, msg: 'Delivery man not found' });
    }

    const maxOrdersRaw = await getBusinessSetting('dm_maximum_orders');
    const maxOrders = maxOrdersRaw ? Number(maxOrdersRaw) : 1;
    if (Number(dm.current_orders) >= maxOrders) {
      return res.status(405).json({
        status: false,
        msg: 'Maximum concurrent orders reached',
      });
    }

    const order = await prisma.orders.findUnique({
      where: { id: BigInt(order_id as string) },
    });

    if (!order || order.order_type === 'pos') {
      return res.status(404).json({ status: false, msg: 'Order not found' });
    }

    if (order.delivery_man_id != null) {
      return res.status(404).json({ status: false, msg: 'Order cannot be accepted' });
    }

    const restaurantIds = await getEligibleRestaurantIdsForDm(dm);
    if (!restaurantIds.includes(Number(order.restaurant_id))) {
      return res.status(403).json({ status: false, msg: 'Order is outside your delivery area' });
    }

    if (order.payment_method === 'cash_on_delivery') {
      const maxCashRaw = await getBusinessSetting('dm_max_cash_in_hand');
      const maxCash = maxCashRaw ? Number(maxCashRaw) : 0;
      if (maxCash > 0) {
        const wallet = await prisma.delivery_man_wallets.findFirst({
          where: { delivery_man_id: deliveryManId },
        });
        const collected = wallet ? Number(wallet.collected_cash) : 0;
        const orderAmount = Number(order.order_amount) - Number(order.partially_paid_amount || 0);
        if (collected + orderAmount >= maxCash) {
          return res.status(203).json({
            status: false,
            msg: 'Delivery man max cash in hand exceeds',
          });
        }
      }
    }

    const nextStatus =
      order.order_status === 'pending' || order.order_status === 'confirmed'
        ? 'accepted'
        : order.order_status;

    const updatedOrder = await prisma.$transaction(async (tx) => {
      const updated = await tx.orders.update({
        where: { id: BigInt(order_id as string) },
        data: {
          delivery_man_id: deliveryManId,
          order_status: nextStatus,
          accepted: new Date(),
          updated_at: new Date(),
        },
      });

      await tx.delivery_men.update({
        where: { id: BigInt(deliveryManId) },
        data: {
          current_orders: { increment: 1 },
          assigned_order_count: { increment: 1 },
          updated_at: new Date(),
        },
      });

      return updated;
    }, ORDER_SETTLEMENT_TX_OPTIONS);

    emitOrderStatusRealtime(updatedOrder);

    return res.status(200).json({
      status: true,
      msg: 'Order accepted successfully',
      data: { id: updatedOrder.id.toString(), order_status: updatedOrder.order_status },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Request failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Description Update order status (picked_up, delivered, etc.)
 * @Route PUT /api/delivery-man/orders/:id/status
 * @Access Private (Delivery Man)
 */
export const updateOrderStatus = async (req: Request, res: Response): Promise<any> => {
  const deliveryManId = requireDmIdFromRequest(req);
  const order_id = req.params.id;

  if (deliveryManId == null) {
    return res.status(401).json({ status: false, msg: 'Unauthorized' });
  }

  const validated = dmUpdateOrderStatusSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(','),
    });
  }

  const { status, reason } = validated.value as { status: string; reason?: string };

  try {
    const order = await prisma.orders.findUnique({
      where: { id: BigInt(order_id as string) },
    });

    if (!order) {
      return res.status(404).json({ status: false, msg: 'Order not found' });
    }

    if (order.delivery_man_id?.toString() !== String(deliveryManId)) {
      return res.status(403).json({ status: false, msg: 'You are not assigned to this order' });
    }

    if (status === 'canceled') {
      const allowCancel = await getBusinessSetting('canceled_by_deliveryman');
      if (allowCancel !== '1') {
        return res.status(403).json({ status: false, msg: 'You cannot cancel this order' });
      }
      if (order.confirmed) {
        return res.status(403).json({
          status: false,
          msg: 'Order cannot be canceled after confirmation',
        });
      }
    }

    const now = new Date();
    const updateData: Record<string, unknown> = {
      order_status: status,
      updated_at: now,
    };

    if (status === 'confirmed') updateData.confirmed = now;
    if (status === 'handover') updateData.handover = now;
    if (status === 'picked_up') updateData.picked_up = now;
    if (status === 'delivered') {
      updateData.delivered = now;
      updateData.payment_status = 'paid';
    }
    if (status === 'canceled') {
      updateData.canceled = now;
      updateData.canceled_by = 'deliveryman';
      updateData.cancellation_reason = reason ?? null;
      updateData.delivery_man_id = null;
    }

    const updatedOrder = await prisma.$transaction(async (tx) => {
      if (status === 'delivered') {
        const settled = await createOrderTransactionIfNeeded(tx, BigInt(order_id as string));
        if (!settled) {
          throw new OrderSettlementError();
        }
      }

      const updated = await tx.orders.update({
        where: { id: BigInt(order_id as string) },
        data: updateData,
      });

      if (status === 'delivered') {
        await tx.restaurants.update({
          where: { id: BigInt(Number(updated.restaurant_id)) },
          data: { order_count: { increment: 1 }, updated_at: now },
        });
      }

      if (status === 'delivered' || status === 'canceled') {
        const dm = await tx.delivery_men.findUnique({
          where: { id: BigInt(deliveryManId) },
        });
        if (dm) {
          const nextCurrent =
            Number(dm.current_orders) > 1 ? Number(dm.current_orders) - 1 : 0;
          await tx.delivery_men.update({
            where: { id: BigInt(deliveryManId) },
            data: {
              current_orders: nextCurrent,
              ...(status === 'delivered'
                ? { order_count: { increment: 1 } }
                : {}),
              updated_at: now,
            },
          });
        }

      }

      return updated;
    }, ORDER_SETTLEMENT_TX_OPTIONS);

    emitOrderStatusRealtime(updatedOrder);

    return res.status(200).json({
      status: true,
      msg: `Order status updated to ${status}`,
      data: {
        id: updatedOrder.id.toString(),
        order_status: updatedOrder.order_status,
      },
    });
  } catch (e: unknown) {
    if (e instanceof OrderSettlementError) {
      return res.status(406).json({
        status: false,
        msg: 'Failed to create order transaction',
      });
    }
    const msg = e instanceof Error ? e.message : 'Request failed';
    return res.status(500).json({ status: false, msg });
  }
};
