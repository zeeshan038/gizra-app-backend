import { Request } from 'express';

/** Legacy customer notifications: `zoneId` header as JSON array. */
export function parseConsumerZoneIds(req: Request): number[] | null {
  const raw = req.headers.zoneid ?? req.headers.zoneId;
  if (raw != null && String(raw).trim()) {
    try {
      const parsed = JSON.parse(String(raw)) as unknown;
      if (Array.isArray(parsed)) {
        const ids = parsed.map((z) => Number(z)).filter((z) => Number.isFinite(z));
        return ids.length ? ids : null;
      }
      const one = Number(parsed);
      return Number.isFinite(one) ? [one] : null;
    } catch {
      const one = Number(raw);
      return Number.isFinite(one) ? [one] : null;
    }
  }

  const q = req.query.zone_id;
  const qStr = Array.isArray(q) ? q[0] : q;
  if (qStr != null && String(qStr).trim()) {
    const one = Number(qStr);
    return Number.isFinite(one) ? [one] : null;
  }

  return null;
}
