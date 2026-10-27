import { Request, Response } from 'express';
import { parseCoordinatesFromRequest, parseZoneIdsFromRequest } from './favouriteHelpers';

/**
 * Require zone id(s) for zone-scoped consumer listings (query `zone_id` preferred).
 * Returns null after sending 403.
 */
export function requireZoneIds(req: Request, res: Response): number[] | null {
  const zoneIds = parseZoneIdsFromRequest(req);
  if (!zoneIds?.length) {
    res.status(403).json({
      status: false,
      msg: 'Zone id is required! Pass query zone_id (e.g. ?zone_id=2) from GET /consumer/config/zone-id.',
    });
    return null;
  }
  return zoneIds;
}

/** Customer map pin — query or headers `latitude` / `longitude`. */
export function requireCoordinates(
  req: Request,
  res: Response
): { lat: number; lng: number } | null {
  const coords = parseCoordinatesFromRequest(req);
  if (!coords) {
    res.status(400).json({
      status: false,
      msg: 'latitude and longitude are required (query or headers).',
    });
    return null;
  }
  return coords;
}
