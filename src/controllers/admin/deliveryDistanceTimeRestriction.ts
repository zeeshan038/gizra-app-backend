import { Request, Response } from 'express';
import { adminDeliveryDistanceTimeRestrictionUpdateSchema } from '../../schemas/admin/DeliveryDistanceTimeRestriction';
import {
  getAdminDeliveryDistanceTimeRestriction,
  updateAdminDeliveryDistanceTimeRestriction,
} from '../../utils/admin/deliveryDistanceTimeRestriction/service';

type Handler = (req: Request, res: Response) => Promise<any>;

/**
 * @Description Get time-based delivery distance restriction (super admin).
 * @Route GET /api/admin/delivery-distance-time-restriction
 * @Access Private (Super Admin)
 */
export const getDeliveryDistanceTimeRestriction: Handler = async (_req, res) => {
  try {
    const data = await getAdminDeliveryDistanceTimeRestriction();
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Description Update time-based delivery distance restriction (super admin).
 * @Route PUT /api/admin/delivery-distance-time-restriction
 * @Access Private (Super Admin)
 */
export const putDeliveryDistanceTimeRestriction: Handler = async (req, res) => {
  const validated = adminDeliveryDistanceTimeRestrictionUpdateSchema.validate(req.body, {
    stripUnknown: true,
  });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  const adminId = Number(req.user?.id);
  if (!Number.isFinite(adminId)) {
    return res.status(401).json({ status: false, msg: 'Unauthorized' });
  }
  try {
    await updateAdminDeliveryDistanceTimeRestriction(validated.value, adminId);
    const data = await getAdminDeliveryDistanceTimeRestriction();
    return res.status(200).json({
      status: true,
      msg: 'Successfully updated',
      data,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Update failed';
    return res.status(400).json({ status: false, msg });
  }
};
