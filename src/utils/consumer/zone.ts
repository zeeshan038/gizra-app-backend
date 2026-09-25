import prisma from '../../config/database';

/** Resolve delivery zone from coordinates (PostGIS), matching legacy Laravel behavior. */
export async function findZoneIdByCoordinates(
  latitude: string | number,
  longitude: string | number
): Promise<number | null> {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  try {
    const rows = await prisma.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM zones
      WHERE status = true
      AND ST_Contains(
        coordinates::geometry,
        ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)
      )
      LIMIT 1
    `;
    return rows[0] ? Number(rows[0].id) : null;
  } catch {
    return null;
  }
}

export async function getZoneById(zoneId: number) {
  return prisma.zones.findUnique({ where: { id: BigInt(zoneId) } });
}
