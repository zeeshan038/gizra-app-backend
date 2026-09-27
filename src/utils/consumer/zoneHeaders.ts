import { Request, Response } from 'express';
import { parseZoneIdsFromRequest } from './favouriteHelpers';

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
