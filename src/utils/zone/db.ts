import prisma from '../../config/database';
import {
  geoJsonPolygonToRing,
  LngLatPair,
  ringToFormattedCoordinates,
  ringToPolygonWkt,
} from './geometry';

export type ZoneSummaryRow = {
  id: bigint;
  name: string;
  display_name: string | null;
  status: boolean;
  per_km_shipping_charge: number | null;
  minimum_shipping_charge: number | null;
  maximum_shipping_charge: number | null;
  max_cod_order_amount: number | null;
  increased_delivery_fee: number;
  increased_delivery_fee_status: boolean;
  increase_delivery_charge_message: string | null;
  restaurant_wise_topic: string | null;
  customer_wise_topic: string | null;
  deliveryman_wise_topic: string | null;
  created_at: Date | null;
  updated_at: Date | null;
};

export type ZoneAtPointRow = ZoneSummaryRow;

type ZoneWithGeoJson = ZoneSummaryRow & { geojson: string | null };

export function formatZoneDataRow(row: ZoneAtPointRow) {
  return {
    id: Number(row.id),
    status: row.status ? 1 : 0,
    name: row.name,
    display_name: row.display_name,
    minimum_shipping_charge: row.minimum_shipping_charge,
    per_km_shipping_charge: row.per_km_shipping_charge,
    maximum_shipping_charge: row.maximum_shipping_charge,
    max_cod_order_amount: row.max_cod_order_amount,
    increased_delivery_fee: row.increased_delivery_fee,
    increased_delivery_fee_status: row.increased_delivery_fee_status ? 1 : 0,
    increase_delivery_charge_message: row.increase_delivery_charge_message,
  };
}

export async function findZonesContainingPoint(
  lat: number,
  lng: number
): Promise<ZoneAtPointRow[]> {
  try {
    return await prisma.$queryRaw<ZoneAtPointRow[]>`
      SELECT
        id, name, display_name, status,
        per_km_shipping_charge, minimum_shipping_charge, maximum_shipping_charge,
        max_cod_order_amount, increased_delivery_fee, increased_delivery_fee_status,
        increase_delivery_charge_message,
        restaurant_wise_topic, customer_wise_topic, deliveryman_wise_topic,
        created_at, updated_at
      FROM zones
      WHERE ST_Contains(
        coordinates::geometry,
        ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)
      )
      ORDER BY id DESC
    `;
  } catch {
    return [];
  }
}

export async function isPointInZone(
  zoneId: number,
  lat: number,
  lng: number
): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<{ ok: boolean }[]>`
      SELECT EXISTS(
        SELECT 1 FROM zones
        WHERE id = ${BigInt(zoneId)}
        AND ST_Contains(
          coordinates::geometry,
          ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)
        )
      ) AS ok
    `;
    return Boolean(rows[0]?.ok);
  } catch {
    return false;
  }
}

export async function listZonesWithGeo(): Promise<ZoneWithGeoJson[]> {
  return prisma.$queryRaw<ZoneWithGeoJson[]>`
    SELECT
      id, name, display_name, status,
      per_km_shipping_charge, minimum_shipping_charge, maximum_shipping_charge,
      max_cod_order_amount, increased_delivery_fee, increased_delivery_fee_status,
      increase_delivery_charge_message,
      restaurant_wise_topic, customer_wise_topic, deliveryman_wise_topic,
      created_at, updated_at,
      ST_AsGeoJSON(coordinates::geometry)::text AS geojson
    FROM zones
    ORDER BY id DESC
  `;
}

export async function getZoneWithGeoById(id: number): Promise<ZoneWithGeoJson | null> {
  const rows = await prisma.$queryRaw<ZoneWithGeoJson[]>`
    SELECT
      id, name, display_name, status,
      per_km_shipping_charge, minimum_shipping_charge, maximum_shipping_charge,
      max_cod_order_amount, increased_delivery_fee, increased_delivery_fee_status,
      increase_delivery_charge_message,
      restaurant_wise_topic, customer_wise_topic, deliveryman_wise_topic,
      created_at, updated_at,
      ST_AsGeoJSON(coordinates::geometry)::text AS geojson
    FROM zones
    WHERE id = ${BigInt(id)}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export function formattedCoordinatesFromGeoJson(geojson: string | null): { lat: number; lng: number }[] {
  if (!geojson) return [];
  try {
    const parsed = JSON.parse(geojson) as { type?: string; coordinates?: number[][][] };
    const ring = geoJsonPolygonToRing(parsed);
    if (!ring) return [];
    return ringToFormattedCoordinates(ring);
  } catch {
    return [];
  }
}

export async function insertZone(params: {
  name: string;
  display_name: string | null;
  status: boolean;
  coordinates: LngLatPair[];
  per_km_shipping_charge: number;
  minimum_shipping_charge: number;
  maximum_shipping_charge: number | null;
  max_cod_order_amount: number | null;
  increased_delivery_fee: number;
  increased_delivery_fee_status: boolean;
  increase_delivery_charge_message: string | null;
}): Promise<number> {
  const wkt = ringToPolygonWkt(params.coordinates);
  const now = new Date();

  const inserted = await prisma.$queryRaw<{ id: bigint }[]>`
    INSERT INTO zones (
      name, display_name, status, coordinates,
      per_km_shipping_charge, minimum_shipping_charge, maximum_shipping_charge,
      max_cod_order_amount, increased_delivery_fee, increased_delivery_fee_status,
      increase_delivery_charge_message, created_at, updated_at
    ) VALUES (
      ${params.name},
      ${params.display_name},
      ${params.status},
      ST_GeomFromText(${wkt}, 4326),
      ${params.per_km_shipping_charge},
      ${params.minimum_shipping_charge},
      ${params.maximum_shipping_charge},
      ${params.max_cod_order_amount},
      ${params.increased_delivery_fee},
      ${params.increased_delivery_fee_status},
      ${params.increase_delivery_charge_message},
      ${now},
      ${now}
    )
    RETURNING id
  `;

  const id = Number(inserted[0].id);
  await prisma.zones.update({
    where: { id: BigInt(id) },
    data: {
      restaurant_wise_topic: `zone_${id}_restaurant`,
      customer_wise_topic: `zone_${id}_customer`,
      deliveryman_wise_topic: `zone_${id}_delivery_man`,
    },
  });

  return id;
}

export async function updateZonePolygon(id: number, coordinates: LngLatPair[]): Promise<void> {
  const wkt = ringToPolygonWkt(coordinates);
  await prisma.$executeRaw`
    UPDATE zones
    SET coordinates = ST_GeomFromText(${wkt}, 4326),
        updated_at = ${new Date()}
    WHERE id = ${BigInt(id)}
  `;
}

export async function zoneExists(id: number): Promise<boolean> {
  const row = await prisma.zones.findUnique({ where: { id: BigInt(id) }, select: { id: true } });
  return row != null;
}
