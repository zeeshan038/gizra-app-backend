//NPM Packages
import { Request, Response } from 'express';

//Prisma
import prisma from '../../config/database';

//Utils
import { getVendorContext } from '../../utils/vendor/context';
import { subscribeVendorOrders } from '../../utils/vendor/order/sseHub';
import {
  buildStatusFilter,
  ORDER_LIST_STATUSES,
  restaurantOrdersBase,
  OrderListStatus,
} from '../../utils/vendor/order/query';
import { mapOrderSummary } from '../../utils/vendor/order/mapper';
import {
  mapOrderDetailLineItem,
  mapVendorOrderDetail,
  resolveOrderDeliveryAddress,
} from '../../utils/vendor/order/detailMapper';
import {
  findCustomerForOrder,
  loadCustomersForOrders,
} from '../../utils/vendor/order/customers';
import { parseOrderIdParam } from '../../utils/vendor/order/params';

//Schema
import {
  orderListQuerySchema,
  pollOrdersQuerySchema,
  updateOrderStatusSchema,
} from '../../schemas/vendor/Order';


/**
 * @Description Get the counts of orders for each status
 * @Route GET /api/vendor/orders/counts
 * @Access Vendor
 */
export const getOrderCounts = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context not found for vendor' });
  }

  try {
    const base = restaurantOrdersBase(ctx.restaurantId);
    const counts: Record<string, number> = {};

    for (const status of ORDER_LIST_STATUSES) {
      const where = { ...base, ...buildStatusFilter(status) };
      counts[status] = await prisma.orders.count({ where });
    }

    return res.status(200).json({ status: true, data: counts });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Paginated marketplace order list for a status tab (excludes order_type=pos)
 * @Route GET /api/vendor/orders
 * @Access Vendor
 */
export const listOrders = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context not found for vendor' });
  }

  const validated = orderListQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(', '),
    });
  }

  const { status, limit, offset, search } = validated.value as {
    status: OrderListStatus;
    limit: number;
    offset: number;
    search?: string;
  };

  try {
    const where: any = {
      ...restaurantOrdersBase(ctx.restaurantId),
      ...buildStatusFilter(status),
    };

    if (search?.trim()) {
      const idSearch = Number(search.trim());
      if (!Number.isNaN(idSearch)) {
        where.id = BigInt(idSearch);
      }
    }

    const [total, orders] = await Promise.all([
      prisma.orders.count({ where }),
      prisma.orders.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: limit,
      }),
    ]);

    const customers = await loadCustomersForOrders(orders);
    const data = orders.map((order) =>
      mapOrderSummary(order, findCustomerForOrder(order, customers))
    );

    return res.status(200).json({
      status: true,
      data: {
        total,
        limit,
        offset,
        orders: data,
      },
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description SSE stream of new marketplace orders for the vendor restaurant (Web Panel alerts)
 * @Route GET /api/vendor/orders/events
 * @Access Vendor
 */
export const streamVendorOrderEvents = (req: Request, res: Response): void => {
  const ctx = getVendorContext(req);
  if (!ctx?.restaurantId) {
    res.status(403).json({ status: false, msg: 'Restaurant context not found for vendor' });
    return;
  }
  subscribeVendorOrders(ctx.restaurantId, req, res);
};


/**
 * @Description Poll pending/confirmed orders with id greater than after_id (optional POS fallback)
 * @Route GET /api/vendor/orders/recent
 * @Access Vendor
 */
export const pollRecentOrders = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context not found for vendor' });
  }

  const validated = pollOrdersQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(', '),
    });
  }

  const { after_id } = validated.value;

  try {
    const where: any = {
      ...restaurantOrdersBase(ctx.restaurantId),
      id: { gt: BigInt(after_id) },
      order_status: { in: ['pending', 'confirmed'] },
    };

    const orders = await prisma.orders.findMany({
      where,
      orderBy: { id: 'asc' },
      take: 20,
    });

    const customers = await loadCustomersForOrders(orders);
    const data = orders.map((order) =>
      mapOrderSummary(order, findCustomerForOrder(order, customers))
    );

    const latestId = orders.length ? Number(orders[orders.length - 1].id) : after_id;

    return res.status(200).json({
      status: true,
      data: { orders: data, latest_id: latestId },
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Order detail with line items for the authenticated vendor restaurant
 * @Route GET /api/vendor/orders/:id
 * @Access Vendor
 */
export const getOrderDetails = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context not found for vendor' });
  }

  const orderId = parseOrderIdParam(req);
  if (!orderId) {
    return res.status(400).json({ status: false, msg: 'Order id required' });
  }

  try {
    const order = await prisma.orders.findFirst({
      where: {
        id: BigInt(orderId),
        ...restaurantOrdersBase(ctx.restaurantId),
      },
    });

    if (!order) {
      return res.status(404).json({ status: false, msg: 'Order not found' });
    }

    const details = await prisma.order_details.findMany({
      where: { order_id: Number(order.id) },
    });

    const foodIds = details.map((d) => Number(d.food_id)).filter(Boolean);
    const foods = foodIds.length
      ? await prisma.food.findMany({
          where: { id: { in: foodIds.map((id) => BigInt(id)) } },
          select: { id: true, name: true, image: true },
        })
      : [];

    let customer: {
      f_name: string | null;
      l_name: string | null;
      phone: string | null;
      email: string | null;
      orders_count?: number;
    } | null = null;

    if (order.user_id) {
      const userId = BigInt(Number(order.user_id));
      const [userRow, ordersCount] = await Promise.all([
        prisma.users.findUnique({
          where: { id: userId },
          select: { f_name: true, l_name: true, phone: true, email: true },
        }),
        prisma.orders.count({ where: { user_id: order.user_id } }),
      ]);
      if (userRow) {
        customer = { ...userRow, orders_count: ordersCount };
      }
    }

    const lineItems = details.map((row) => {
      const foodRow = foods.find((f) => Number(f.id) === Number(row.food_id));
      return mapOrderDetailLineItem(row, foodRow);
    });

    const restaurant = await prisma.restaurants.findUnique({
      where: { id: BigInt(Number(order.restaurant_id)) },
      select: {
        name: true,
        address: true,
        logo: true,
        latitude: true,
        longitude: true,
      },
    });

    const deliveryAddress = await resolveOrderDeliveryAddress(order);
    const orderForDetail = deliveryAddress
      ? { ...order, delivery_address: deliveryAddress }
      : order;

    return res.status(200).json({
      status: true,
      data: mapVendorOrderDetail(orderForDetail, customer, lineItems, restaurant),
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Update marketplace order workflow status (confirm, processing, handover, delivered, cancel)
 * @Route PUT /api/vendor/orders/:id/status
 * @Access Vendor
 */
export const updateOrderStatus = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context not found for vendor' });
  }

  const validated = updateOrderStatusSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(', '),
    });
  }

  const { status, cancellation_reason } = validated.value;
  const orderId = parseOrderIdParam(req);
  if (!orderId) {
    return res.status(400).json({ status: false, msg: 'Order id required' });
  }

  try {
    const order = await prisma.orders.findFirst({
      where: {
        id: BigInt(orderId),
        ...restaurantOrdersBase(ctx.restaurantId),
      },
    });

    if (!order) {
      return res.status(404).json({ status: false, msg: 'Order not found' });
    }

    if (order.picked_up && status !== 'canceled') {
      return res.status(400).json({
        status: false,
        msg: 'Cannot change status after order was picked up by delivery',
      });
    }

    const now = new Date();
    const updateData: Record<string, unknown> = {
      order_status: status,
      updated_at: now,
    };

    if (status === 'confirmed') updateData.confirmed = now;
    if (status === 'processing') updateData.processing = now;
    if (status === 'handover') updateData.handover = now;
    if (status === 'delivered') updateData.delivered = now;
    if (status === 'canceled') {
      updateData.canceled = now;
      updateData.canceled_by = 'restaurant';
      if (cancellation_reason) updateData.cancellation_reason = cancellation_reason;
    }

    const updated = await prisma.orders.update({
      where: { id: order.id },
      data: updateData,
    });

    return res.status(200).json({
      status: true,
      msg: `Order status updated to ${status}`,
      data: mapOrderSummary(updated, null),
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};
