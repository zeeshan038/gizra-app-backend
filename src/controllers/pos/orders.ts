import { Request, Response } from 'express';
import { loadOrderForPosKey } from '../../utils/pos/auth/scope';
import {
  acceptOrderViaPos,
  PosOrderActionError,
  rejectOrderViaPos,
} from '../../utils/pos/orders/acceptReject';
import { getPosOrderDetail } from '../../utils/pos/orders/getOrder';
import { listPosOrders } from '../../utils/pos/orders/listOrders';
import { mapOrderSummary } from '../../utils/vendor/order/mapper';
import {
  posListOrdersQuerySchema,
  posOrderIdParamSchema,
  posRejectSchema,
} from '../../schemas/pos/orders';
import { keyHasScope } from '../../utils/pos/auth/token';

function parseOrderId(req: Request): bigint | null {
  const validated = posOrderIdParamSchema.validate(req.params, { stripUnknown: true });
  if (validated.error) return null;
  try {
    return BigInt(String(validated.value.id));
  } catch {
    return null;
  }
}

/**
 * @Description Accept order from third-party POS
 * @Route POST /api/v1/pos/orders/:id/accept
 * @Access POS partner token
 */
export const posAcceptOrder = async (req: Request, res: Response): Promise<any> => {
  const partner = req.posPartner;
  if (!partner) {
    return res.status(401).json({ status: false, msg: 'Unauthorized' });
  }
  if (!keyHasScope(partner.key, 'orders:write') && !keyHasScope(partner.key, '*')) {
    return res.status(403).json({ status: false, msg: 'POS token lacks orders:write scope' });
  }

  const orderId = parseOrderId(req);
  if (!orderId) {
    return res.status(400).json({ status: false, msg: 'Valid order id required' });
  }

  try {
    const order = await loadOrderForPosKey(partner.key, orderId);
    if (!order) {
      return res.status(404).json({ status: false, msg: 'Order not found for this POS credential' });
    }

    const updated = await acceptOrderViaPos(order);
    return res.status(200).json({
      status: true,
      msg: 'Order accepted',
      data: mapOrderSummary(updated, null),
    });
  } catch (e: any) {
    if (e instanceof PosOrderActionError) {
      return res.status(e.statusCode).json({ status: false, msg: e.message });
    }
    return res.status(500).json({ status: false, msg: e.message || 'Accept failed' });
  }
};

/**
 * @Description Reject order from third-party POS
 * @Route POST /api/v1/pos/orders/:id/reject
 * @Access POS partner token
 */
export const posRejectOrder = async (req: Request, res: Response): Promise<any> => {
  const partner = req.posPartner;
  if (!partner) {
    return res.status(401).json({ status: false, msg: 'Unauthorized' });
  }
  if (!keyHasScope(partner.key, 'orders:write') && !keyHasScope(partner.key, '*')) {
    return res.status(403).json({ status: false, msg: 'POS token lacks orders:write scope' });
  }

  const orderId = parseOrderId(req);
  if (!orderId) {
    return res.status(400).json({ status: false, msg: 'Valid order id required' });
  }

  const validated = posRejectSchema.validate(req.body || {}, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(', '),
    });
  }

  try {
    const order = await loadOrderForPosKey(partner.key, orderId);
    if (!order) {
      return res.status(404).json({ status: false, msg: 'Order not found for this POS credential' });
    }

    const reason = validated.value.reason || validated.value.cancellation_reason;
    const updated = await rejectOrderViaPos(order, reason);
    return res.status(200).json({
      status: true,
      msg: 'Order rejected',
      data: mapOrderSummary(updated, null),
    });
  } catch (e: any) {
    if (e instanceof PosOrderActionError) {
      return res.status(e.statusCode).json({ status: false, msg: e.message });
    }
    return res.status(500).json({ status: false, msg: e.message || 'Reject failed' });
  }
};

/**
 * @Description Get authoritative order details for POS reconciliation
 * @Route GET /api/v1/pos/orders/:id
 * @Access POS partner token
 */
export const posGetOrder = async (req: Request, res: Response): Promise<any> => {
  const partner = req.posPartner;
  if (!partner) {
    return res.status(401).json({ status: false, msg: 'Unauthorized' });
  }

  const orderId = parseOrderId(req);
  if (!orderId) {
    return res.status(400).json({ status: false, msg: 'Valid order id required' });
  }

  try {
    const detail = await getPosOrderDetail(orderId, partner.restaurantId);
    if (!detail) {
      return res.status(404).json({ status: false, msg: 'Order not found for this POS credential' });
    }
    return res.status(200).json({ status: true, data: detail });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message || 'Failed to load order' });
  }
};

/**
 * @Description List orders for missed-order recovery
 * @Route GET /api/v1/pos/orders
 * @Access POS partner token
 */
export const posListOrders = async (req: Request, res: Response): Promise<any> => {
  const partner = req.posPartner;
  if (!partner) {
    return res.status(401).json({ status: false, msg: 'Unauthorized' });
  }

  const validated = posListOrdersQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(', '),
    });
  }

  try {
    const result = await listPosOrders({
      restaurantId: partner.restaurantId,
      status: validated.value.status || undefined,
      limit: validated.value.limit,
      offset: validated.value.offset,
      updated_since: validated.value.updated_since,
    });
    return res.status(200).json({ status: true, ...result });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message || 'Failed to list orders' });
  }
};
