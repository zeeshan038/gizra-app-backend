import prisma from '../../../config/database';
import { formattedCoordinatesFromGeoJson, listZonesWithGeo } from '../../zone/db';

export type AdminZoneListItem = {
  id: number;
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
  restaurant_count: number;
  deliveryman_count: number;
  formated_coordinates: { lat: number; lng: number }[];
  created_at: Date | null;
};

export async function listAdminZonesWithCounts(search?: string): Promise<AdminZoneListItem[]> {
  const rows = await listZonesWithGeo();
  const q = search?.trim().toLowerCase();

  const filtered = q
    ? rows.filter(
        (z) =>
          z.name.toLowerCase().includes(q) ||
          (z.display_name?.toLowerCase().includes(q) ?? false)
      )
    : rows;

  const zoneIds = filtered.map((z) => Number(z.id));

  const [restaurantGroups, deliveryGroups] = await Promise.all([
    zoneIds.length
      ? prisma.restaurants.groupBy({
          by: ['zone_id'],
          where: { zone_id: { in: zoneIds } },
          _count: { id: true },
        })
      : [],
    zoneIds.length
      ? prisma.delivery_men.groupBy({
          by: ['zone_id'],
          where: { zone_id: { in: zoneIds } },
          _count: { id: true },
        })
      : [],
  ]);

  const restaurantsByZone = new Map<number, number>();
  for (const g of restaurantGroups) {
    if (g.zone_id != null) restaurantsByZone.set(Number(g.zone_id), g._count.id);
  }
  const deliveryByZone = new Map<number, number>();
  for (const g of deliveryGroups) {
    if (g.zone_id != null) deliveryByZone.set(Number(g.zone_id), g._count.id);
  }

  return filtered.map((row) => ({
    id: Number(row.id),
    name: row.name,
    display_name: row.display_name,
    status: row.status,
    per_km_shipping_charge: row.per_km_shipping_charge,
    minimum_shipping_charge: row.minimum_shipping_charge,
    maximum_shipping_charge: row.maximum_shipping_charge,
    max_cod_order_amount: row.max_cod_order_amount,
    increased_delivery_fee: row.increased_delivery_fee,
    increased_delivery_fee_status: row.increased_delivery_fee_status,
    increase_delivery_charge_message: row.increase_delivery_charge_message,
    restaurant_count: restaurantsByZone.get(Number(row.id)) ?? 0,
    deliveryman_count: deliveryByZone.get(Number(row.id)) ?? 0,
    formated_coordinates: formattedCoordinatesFromGeoJson(row.geojson),
    created_at: row.created_at,
  }));
}
