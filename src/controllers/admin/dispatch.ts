import { Request, Response } from 'express';
import { adminRequestDriverSchema } from '../../schemas/admin/dispatch';
import { adminDispatchDeliveryFeeQuerySchema } from '../../schemas/dispatch/deliveryFee';
import {
  requestManualDispatchDriver,
  ManualDispatchRequestBody,
} from '../../utils/order/requestManualDispatchDriver';
import { quoteDeliveryFeeForDestination } from '../../utils/delivery/quoteDeliveryFee';
import { errorMessageFromUnknown, joiFirstMessage, sendApiError } from '../../utils/apiErrorResponse';

/**
 * Quote delivery fee for admin Request Gizra driver (same tiered formula as customer app).
 *
 * @Route GET /api/admin/dispatch/delivery-fee
 * @Access Private (Admin JWT)
 */
export const adminGetDispatchDeliveryFeeQuote = async (
  req: Request,
  res: Response
): Promise<any> => {
  const validated = adminDispatchDeliveryFeeQuerySchema.validate(req.query, {
    stripUnknown: true,
  });
  if (validated.error) {
    return sendApiError(res, 403, joiFirstMessage(validated.error));
  }

  const v = validated.value as {
    restaurant_id: number;
    destination_lat: string | number;
    destination_lng: string | number;
  };

  try {
    const result = await quoteDeliveryFeeForDestination({
      restaurantId: Number(v.restaurant_id),
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
 * Admin requests a Gizra driver on behalf of a restaurant (manual dispatch).
 *
 * @Route POST /api/admin/dispatch/request-driver
 * @Access Private (Admin JWT)
 */
export const adminRequestDriver = async (req: Request, res: Response): Promise<any> => {
  const validated = adminRequestDriverSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(403).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(','),
    });
  }

  const { restaurant_id, ...rest } = validated.value as ManualDispatchRequestBody & {
    restaurant_id: number;
  };

  const result = await requestManualDispatchDriver(restaurant_id, rest, {
    requireManualDispatchEnabled: false,
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
