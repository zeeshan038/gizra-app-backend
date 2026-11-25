import { Request, Response } from 'express';
import { vendorRequestDriverSchema } from '../../schemas/vendor/dispatch';
import { dispatchDeliveryFeeQuerySchema } from '../../schemas/dispatch/deliveryFee';
import { getVendorContext } from '../../utils/vendor/context';
import {
  requestManualDispatchDriver,
  ManualDispatchRequestBody,
} from '../../utils/order/requestManualDispatchDriver';
import { quoteDeliveryFeeForDestination } from '../../utils/delivery/quoteDeliveryFee';
import { errorMessageFromUnknown, joiFirstMessage, sendApiError } from '../../utils/apiErrorResponse';

/**
 * Quote delivery fee for Request Gizra driver (same tiered formula as customer app).
 *
 * @Route GET /api/vendor/dispatch/delivery-fee
 * @Access Private (Vendor / POS JWT)
 */
export const getDispatchDeliveryFeeQuote = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context not found for vendor' });
  }

  const validated = dispatchDeliveryFeeQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return sendApiError(res, 403, joiFirstMessage(validated.error));
  }

  const v = validated.value as {
    destination_lat: string | number;
    destination_lng: string | number;
  };

  try {
    const result = await quoteDeliveryFeeForDestination({
      restaurantId: ctx.restaurantId,
      destinationLat: Number(v.destination_lat),
      destinationLng: Number(v.destination_lng),
      applyFreeDelivery: false,
      enforceRestrictions: false,
    });

    if (!result.ok) {
      return res.status(result.status).json({
        status: false,
        msg: result.msg,
        code: result.code,
        retryable: result.retryable,
      });
    }

    const { ok: _ok, ...data } = result;
    return res.status(200).json({
      status: true,
      msg: 'Delivery fee quoted',
      data,
    });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * Manual driver dispatch from POS (phone order).
 *
 * Order IDs use the same `orders.id` autoincrement sequence as consumer checkout
 * (next id after the latest row in `orders`). Legacy PHP forced manual dispatch
 * ids to at least 100000; this handler intentionally does not.
 *
 * @Route POST /api/vendor/dispatch/request-driver
 * @Access Private (Vendor / POS JWT)
 */
export const requestDriver = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context not found for vendor' });
  }

  const validated = vendorRequestDriverSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(403).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(','),
    });
  }

  const body = validated.value as ManualDispatchRequestBody;

  const result = await requestManualDispatchDriver(ctx.restaurantId, body, {
    requireManualDispatchEnabled: true,
  });

  if (!result.ok) {
    return res.status(result.status).json({ status: false, msg: result.msg });
  }

  return res.status(result.status).json({
    status: true,
    msg: result.msg,
    data: result.data,
  });
};
