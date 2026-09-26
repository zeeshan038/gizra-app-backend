import { Request, Response } from 'express';
import { parseZoneIdsFromRequest } from './favouriteHelpers';

/**
 * Require legacy `zoneId` header for zone-scoped consumer listings.
 * Returns null after sending 403.
 */
export function requireZoneIds(req: Request, res: Response): number[] | null {
  const zoneIds = parseZoneIdsFromRequest(req);
  if (!zoneIds?.length) {
    res.status(403).json({
      status: false,
      msg: 'Zone id is required!',
    });
    return null;
  }
  return zoneIds;
}
