import { Request, Response } from 'express';
import { buildEmergencyServicePausePublicPayload } from '../../utils/delivery/emergencyServicePause';

/**
 * @Description Public emergency pause state for customer app banner / checkout guards.
 * @Route GET /api/consumer/config/emergency-service-pause
 * @Access Public
 */
export async function getConsumerEmergencyServicePause(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const emergency_service_pause = await buildEmergencyServicePausePublicPayload();
    res.status(200).json(emergency_service_pause);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    res.status(500).json({ status: false, msg });
  }
}
