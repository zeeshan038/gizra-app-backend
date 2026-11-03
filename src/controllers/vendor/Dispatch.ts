import { Request, Response } from 'express';
import { vendorRequestDriverSchema } from '../../schemas/vendor/dispatch';
import { getVendorContext } from '../../utils/vendor/context';
import {
  requestManualDispatchDriver,
  ManualDispatchRequestBody,
} from '../../utils/order/requestManualDispatchDriver';

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
