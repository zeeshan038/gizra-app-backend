import prisma from '../../config/database';
import { findZonesContainingPoint } from '../zone/db';

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

export async function getZoneById(zoneId: number) {
  return prisma.zones.findUnique({ where: { id: BigInt(zoneId) } });
}

export { findZonesContainingPoint, formatZoneDataRow, isPointInZone } from '../zone/db';
