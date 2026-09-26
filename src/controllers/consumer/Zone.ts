import { Request, Response } from 'express';
import {
  consumerZoneCheckQuerySchema,
  consumerZoneIdQuerySchema,
} from '../../schemas/consumer/zone';
import {
  findZonesContainingPoint,
  formatZoneDataRow,
  formattedCoordinatesFromGeoJson,
  isPointInZone,
  listZonesWithGeo,
} from '../../utils/zone/db';


/**
 * @Description Resolve zone(s) at lat/lng (legacy config/get-zone-id)
 * @Route GET /api/consumer/config/zone-id
 */
export const getZoneIdFromCoordinates = async (req: Request, res: Response): Promise<any> => {
  const validated = consumerZoneIdQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    const msg = validated.error.details[0]?.message ?? 'Invalid coordinates';
    return res.status(403).json({ status: false, msg });
  }

  const { lat, lng } = validated.value as { lat: number; lng: number };

  try {
    const zones = await findZonesContainingPoint(lat, lng);
    if (!zones.length) {
      return res.status(404).json({
        status: false,
        msg: 'Service not available in this area',
      });
    }

    const active = zones.filter((z) => z.status);
    if (!active.length) {
      return res.status(403).json({
        status: false,
        msg: 'We are temporarily unavailable in this area',
      });
    }

    const zone_data = active.map(formatZoneDataRow);
    const ids = active.map((z) => Number(z.id));

    return res.status(200).json({
      zone_id: JSON.stringify(ids),
      zone_data,
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Active zones with map coordinates (legacy zone/list)
 * @Route GET /api/consumer/zone/list
 */
export const listConsumerZones = async (_req: Request, res: Response): Promise<any> => {
  try {
    const rows = await listZonesWithGeo();
    const active = rows.filter((z) => z.status);
    const payload = active.map((row) => ({
      id: Number(row.id),
      name: row.name,
      display_name: row.display_name,
      status: row.status,
      formated_coordinates: formattedCoordinatesFromGeoJson(row.geojson),
    }));
    return res.status(200).json(payload);
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Check if lat/lng is inside a zone (legacy zone/check)
 * @Route GET /api/consumer/zone/check
 */
export const checkConsumerZone = async (req: Request, res: Response): Promise<any> => {
  const validated = consumerZoneCheckQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    const msg = validated.error.details[0]?.message ?? 'Invalid coordinates';
    return res.status(403).json({ status: false, msg });
  }

  const { lat, lng, zone_id } = validated.value as {
    lat: number;
    lng: number;
    zone_id: number;
  };

  try {
    const ok = await isPointInZone(zone_id, lat, lng);
    return res.status(200).json(ok);
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};
