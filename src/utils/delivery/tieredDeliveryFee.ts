import { roundMoney } from '../vendor/walletHelpers';

/** Zone/restaurant delivery pricing (base fee covers first N km; extra rate after). */
export type TieredDeliveryPricing = {
  base_fee: number;
  base_distance_km: number;
  extra_per_km: number;
  maximum_fee: number;
  increased_fee_percent: number;
};

export type TieredDeliveryFeeBreakdown = {
  distance_km: number;
  base_fee: number;
  base_distance_km: number;
  extra_km: number;
  extra_per_km: number;
  subtotal_before_surge: number;
  surge_percent: number;
  delivery_fee: number;
};

const DEFAULT_BASE_DISTANCE_KM = 2;

export function normalizeTieredDeliveryPricing(input: {
  minimum_shipping_charge?: unknown;
  base_distance_km?: unknown;
  per_km_shipping_charge?: unknown;
  maximum_shipping_charge?: unknown;
  increased_delivery_fee?: unknown;
  increased_delivery_fee_status?: boolean;
}): TieredDeliveryPricing {
  const base_fee = Math.max(0, Number(input.minimum_shipping_charge) || 0);
  const rawBaseDist = Number(input.base_distance_km);
  const base_distance_km =
    Number.isFinite(rawBaseDist) && rawBaseDist >= 0 ? rawBaseDist : DEFAULT_BASE_DISTANCE_KM;
  const extra_per_km = Math.max(0, Number(input.per_km_shipping_charge) || 0);
  const maxRaw = Number(input.maximum_shipping_charge);
  const maximum_fee =
    Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : Number.POSITIVE_INFINITY;
  const increased_fee_percent =
    input.increased_delivery_fee_status && Number(input.increased_delivery_fee) > 0
      ? Number(input.increased_delivery_fee)
      : 0;

  return {
    base_fee,
    base_distance_km,
    extra_per_km,
    maximum_fee,
    increased_fee_percent,
  };
}

/**
 * Base fee for distance <= base_distance_km; otherwise base + (distance - base) * extra_per_km.
 * Applies max cap and optional surge % on the subtotal.
 */
export function computeTieredDeliveryFee(
  distanceKm: number,
  pricing: TieredDeliveryPricing
): TieredDeliveryFeeBreakdown {
  const distance_km = Math.max(0, Number(distanceKm) || 0);
  const extra_km =
    distance_km <= pricing.base_distance_km
      ? 0
      : Math.round((distance_km - pricing.base_distance_km) * 1000) / 1000;

  let subtotal =
    distance_km <= pricing.base_distance_km
      ? pricing.base_fee
      : pricing.base_fee + extra_km * pricing.extra_per_km;

  if (
    Number.isFinite(pricing.maximum_fee) &&
    pricing.maximum_fee > pricing.base_fee &&
    subtotal > pricing.maximum_fee
  ) {
    subtotal = pricing.maximum_fee;
  }

  const surge = (subtotal * pricing.increased_fee_percent) / 100;
  const delivery_fee = roundMoney(subtotal + surge);

  return {
    distance_km: Math.round(distance_km * 1000) / 1000,
    base_fee: pricing.base_fee,
    base_distance_km: pricing.base_distance_km,
    extra_km,
    extra_per_km: pricing.extra_per_km,
    subtotal_before_surge: roundMoney(subtotal),
    surge_percent: pricing.increased_fee_percent,
    delivery_fee,
  };
}
