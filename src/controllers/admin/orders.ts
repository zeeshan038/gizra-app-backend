import { Request, Response } from 'express';
import prisma from '../../config/database';
import {
  adminOrdersListQuerySchema,
  adminSubscriptionsListQuerySchema,
  assignAdminOrderDeliveryManSchema,
} from '../../schemas/admin/Orders';
import { assignAdminOrderDeliveryMan } from '../../utils/admin/orders/assignDeliveryMan';
import { getAdminOrderCounts } from '../../utils/admin/orders/counts';
import { getAdminOrderDetail } from '../../utils/admin/orders/orderDetail';
import { listAdminOrders } from '../../utils/admin/orders/listOrders';
import { getAdminNewOrderAlert } from '../../utils/admin/orders/newOrderAlert';
import {
  getAdminSubscriptionDetail,
  listAdminSubscriptions,
} from '../../utils/admin/orders/subscriptions';
import { deleteAdminOrder } from '../../utils/admin/orders/deleteAdminOrder';
import { buildOrderInvoice } from '../../utils/order/invoiceMapper';
import { notPosWhere } from '../../utils/vendor/order/query';

/**
 * @Description Order sidebar badge counts
 * @Route GET /api/admin/orders/counts
 */
export const getAdminOrderCountsHandler = async (_req: Request, res: Response): Promise<any> => {
  try {
    const data = await getAdminOrderCounts();
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Poll for unchecked orders (legacy admin sound alert, 10s interval)
 * @Route GET /api/admin/orders/new-order-alert
 */
export const getAdminNewOrderAlertHandler = async (_req: Request, res: Response): Promise<any> => {
  try {
    const data = await getAdminNewOrderAlert();
    return res.status(200).json({ status: true, data });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Paginated admin order list
 * @Route GET /api/admin/orders
 */
export const listAdminOrdersHandler = async (req: Request, res: Response): Promise<any> => {
  const validated = adminOrdersListQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(', '),
    });
  }

  const q = validated.value as {
    status: string;
    search?: string;
    limit: number;
    offset: number;
    manual_only: boolean;
    dispatch_status?: string;
    refund_status?: string;
  };

  try {
    const data = await listAdminOrders({
      status: q.status,
      search: q.search,
      limit: q.limit,
      offset: q.offset,
      manualOnly: q.manual_only,
      dispatchStatus: q.dispatch_status || null,
      refundStatus: q.refund_status || null,
    });
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e: any) {
    console.error('[admin/orders/list]', e);
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Permanently delete an order (admin only)
 * @Route DELETE /api/admin/orders/:orderId
 */
export const deleteAdminOrderHandler = async (req: Request, res: Response): Promise<any> => {
  const orderId = Number(req.params.orderId);
  if (!Number.isFinite(orderId) || orderId <= 0) {
    return res.status(400).json({ status: false, msg: 'Invalid order id' });
  }
  const result = await deleteAdminOrder(orderId);
  if (!result.ok) {
    const status = result.msg === 'Order not found' ? 404 : 500;
    return res.status(status).json({ status: false, msg: result.msg });
  }
  return res.status(200).json({ status: true, msg: 'Order deleted successfully' });
};

/**
 * @Description Order detail for admin order view
 * @Route GET /api/admin/orders/:orderId
 */
export const getAdminOrderDetailHandler = async (req: Request, res: Response): Promise<any> => {
  const orderId = Number(req.params.orderId);
  if (!Number.isFinite(orderId) || orderId <= 0) {
    return res.status(400).json({ status: false, msg: 'Invalid order id' });
  }

  try {
    const data = await getAdminOrderDetail(orderId);
    if (!data) {
      return res.status(404).json({ status: false, msg: 'Order not found' });
    }
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Assign or reassign delivery man (legacy admin add-delivery-man)
 * @Route PUT /api/admin/orders/:orderId/delivery-man
 */
export const assignAdminOrderDeliveryManHandler = async (
  req: Request,
  res: Response
): Promise<any> => {
  const orderId = Number(req.params.orderId);
  if (!Number.isFinite(orderId) || orderId <= 0) {
    return res.status(400).json({ status: false, msg: 'Invalid order id' });
  }

  const validated = assignAdminOrderDeliveryManSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(', '),
    });
  }

  try {
    const result = await assignAdminOrderDeliveryMan(
      orderId,
      validated.value.delivery_man_id
    );
    if (!result.ok) {
      return res.status(result.status).json({ status: false, msg: result.msg });
    }
    return res.status(200).json({ status: true, msg: 'Delivery man assigned successfully' });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Order invoice payload for browser/thermal print (legacy PHP generate-invoice)
 * @Route GET /api/admin/orders/:orderId/invoice
 */
export const getAdminOrderInvoiceHandler = async (req: Request, res: Response): Promise<any> => {
  const orderId = Number(req.params.orderId);
  if (!Number.isFinite(orderId) || orderId <= 0) {
    return res.status(400).json({ status: false, msg: 'Invalid order id' });
  }

  try {
    const order = await prisma.orders.findFirst({
      where: { id: BigInt(orderId), ...notPosWhere },
    });
    if (!order) {
      return res.status(404).json({ status: false, msg: 'Order not found' });
    }

    const data = await buildOrderInvoice(order);
    if (!data) {
      return res.status(404).json({ status: false, msg: 'Invoice not available for this order' });
    }

    return res.status(200).json({
      status: true,
      msg: 'Invoice fetched successfully',
      data,
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Subscription orders list
 * @Route GET /api/admin/orders/subscriptions/list
 */
export const listAdminSubscriptionsHandler = async (req: Request, res: Response): Promise<any> => {
  const validated = adminSubscriptionsListQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(', '),
    });
  }

  try {
    const data = await listAdminSubscriptions(validated.value);
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Subscription detail
 * @Route GET /api/admin/orders/subscriptions/:subscriptionId
 */
export const getAdminSubscriptionDetailHandler = async (
  req: Request,
  res: Response
): Promise<any> => {
  const subscriptionId = Number(req.params.subscriptionId);
  if (!Number.isFinite(subscriptionId) || subscriptionId <= 0) {
    return res.status(400).json({ status: false, msg: 'Invalid subscription id' });
  }

  try {
    const data = await getAdminSubscriptionDetail(subscriptionId);
    if (!data) {
      return res.status(404).json({ status: false, msg: 'Subscription not found' });
    }
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};
