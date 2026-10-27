import { Request, Response } from 'express';
import { listZonesWithGeo } from '../../utils/zone/db';

/**
 * @Description Active zones for driver signup city picker (legacy PHP zone/list)
 * @Route GET /api/delivery-man/zones
 * @Access Public
 */
export const listDeliveryManZones = async (_req: Request, res: Response): Promise<any> => {
  try {
    const rows = await listZonesWithGeo();
    const zones = rows
      .filter((z) => z.status)
      .map((row) => ({
        id: row.id.toString(),
        name: row.name,
        display_name: row.display_name,
      }));

    return res.status(200).json({
      status: true,
      msg: 'Zones fetched successfully',
      data: { zones },
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};
