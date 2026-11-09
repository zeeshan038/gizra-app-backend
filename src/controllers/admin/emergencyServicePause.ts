import { Request, Response } from 'express';
import { adminEmergencyServicePauseUpdateSchema } from '../../schemas/admin/EmergencyServicePause';
import {
  getAdminEmergencyServicePause,
  updateAdminEmergencyServicePause,
} from '../../utils/admin/emergencyServicePause/service';

type Handler = (req: Request, res: Response) => Promise<any>;

/**
 * @Description Get emergency service pause switches (super admin).
 * @Route GET /api/admin/emergency-service-pause
 * @Access Private (Super Admin)
 */
export const getEmergencyServicePause: Handler = async (_req, res) => {
  try {
    const data = await getAdminEmergencyServicePause();
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Description Update emergency service pause (super admin).
 * @Route PUT /api/admin/emergency-service-pause
 * @Access Private (Super Admin)
 */
export const putEmergencyServicePause: Handler = async (req, res) => {
  const validated = adminEmergencyServicePauseUpdateSchema.validate(req.body, {
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
    await updateAdminEmergencyServicePause(validated.value, adminId);
    const data = await getAdminEmergencyServicePause();
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
