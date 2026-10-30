import { Request, Response } from 'express';
import { adminRequestDriverSchema } from '../../schemas/admin/dispatch';
import {
  requestManualDispatchDriver,
  ManualDispatchRequestBody,
} from '../../utils/order/requestManualDispatchDriver';

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
