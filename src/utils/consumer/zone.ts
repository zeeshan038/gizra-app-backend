import prisma from '../../config/database';
import { findZonesContainingPoint, isPointInZone } from '../zone/db';

/** Resolve one active delivery zone from coordinates (PostGIS). */
export async function findZoneIdByCoordinates(
  latitude: string | number,
  longitude: string | number
): Promise<number | null> {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const zones = await findZonesContainingPoint(lat, lng);
  const active = zones.find((z) => z.status);
  return active ? Number(active.id) : null;
}

/**
 * Resolve zone for address save: prefer client zone_id from GET /config/zone-id when
 * the pin is inside that zone; otherwise fall back to coordinate lookup.
 */
export async function resolveZoneIdForAddress(
  latitude: string | number,
  longitude: string | number,
  clientZoneId?: number
): Promise<number | null> {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  if (clientZoneId != null && Number.isFinite(clientZoneId)) {
    if (await isPointInZone(clientZoneId, lat, lng)) {
      return clientZoneId;
    }
  }

  return findZoneIdByCoordinates(lat, lng);
}

export async function getZoneById(zoneId: number) {
  return prisma.zones.findUnique({ where: { id: BigInt(zoneId) } });
}

export { findZonesContainingPoint, formatZoneDataRow, isPointInZone } from '../zone/db';
