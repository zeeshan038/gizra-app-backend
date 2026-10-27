import { getZoneById } from '../consumer/zone';
import {
  normalizeTieredDeliveryPricing,
  type TieredDeliveryPricing,
} from './tieredDeliveryFee';

export type DeliveryPricingSource = {
  zone_id: unknown;
  self_delivery_system: boolean;
  minimum_shipping_charge: unknown;
  base_distance_km?: unknown;
  per_km_shipping_charge: number | null;
  maximum_shipping_charge: number | null;
};

export async function resolveTieredDeliveryPricing(
  restaurant: DeliveryPricingSource,
  options?: { latitude?: string; longitude?: string }
): Promise<{ pricing: TieredDeliveryPricing; max_cod_order_amount: number }> {
  let minimum = Number(restaurant.minimum_shipping_charge) || 0;
  let baseDistance = restaurant.base_distance_km;
  let perKm = Number(restaurant.per_km_shipping_charge) || 0;
  let maximum = Number(restaurant.maximum_shipping_charge) || 0;
  let maxCod = 0;
  let increasedPct = 0;
  let increasedStatus = false;

  if (options?.latitude && options?.longitude && restaurant.zone_id) {
    const zone = await getZoneById(Number(restaurant.zone_id));
    if (zone) {
      if (zone.per_km_shipping_charge != null && zone.minimum_shipping_charge != null) {
        perKm = zone.per_km_shipping_charge;
        minimum = zone.minimum_shipping_charge;
        baseDistance = zone.base_distance_km ?? baseDistance;
        maximum = zone.maximum_shipping_charge ?? maximum;
        maxCod = zone.max_cod_order_amount ?? 0;
      }
      increasedStatus = zone.increased_delivery_fee_status;
      increasedPct = zone.increased_delivery_fee;
    }
  }

  if (restaurant.self_delivery_system) {
    perKm = Number(restaurant.per_km_shipping_charge) || perKm;
    minimum = Number(restaurant.minimum_shipping_charge) || minimum;
    if (restaurant.base_distance_km != null) {
      baseDistance = restaurant.base_distance_km;
    }
    maximum = Number(restaurant.maximum_shipping_charge) || maximum;
  }

  const pricing = normalizeTieredDeliveryPricing({
    minimum_shipping_charge: minimum,
    base_distance_km: baseDistance,
    per_km_shipping_charge: perKm,
    maximum_shipping_charge: maximum,
    increased_delivery_fee: increasedPct,
    increased_delivery_fee_status: increasedStatus,
  });

  return { pricing, max_cod_order_amount: maxCod };
}
