import prisma from '../../config/database';
import { parseRestaurantCoordinates } from '../consumer/restaurantDiscoverHelpers';
import { resolveDeliveryDistanceKm } from './deliveryDistanceKm';
import { isDeliveryDistanceUnavailableError } from './deliveryDistanceError';
import { resolveTieredDeliveryPricing } from './resolveDeliveryPricing';
import { computeTieredDeliveryFee } from './tieredDeliveryFee';
import {
  DELIVERY_DISTANCE_TIME_RESTRICTED_CODE,
  evaluateDeliveryDistanceTimeRestriction,
} from './deliveryDistanceTimeRestriction';
import {
  EMERGENCY_SERVICE_PAUSED_CODE,
  evaluateEmergencyServicePause,
} from './emergencyServicePause';

export type QuoteDeliveryFeeInput = {
  restaurantId: number;
  destinationLat: number;
  destinationLng: number;
  /** When true (customer app), restaurant.free_delivery zeroes the fee. Manual dispatch keeps the calculated fee. */
  applyFreeDelivery?: boolean;
  /** When true (customer app), return blocked errors for emergency pause / time distance rules. */
  enforceRestrictions?: boolean;
};

export type QuoteDeliveryFeeSuccess = {
  ok: true;
  restaurant_id: number;
  distance_km: number;
  distance_source: string;
  delivery_fee: number;
  original_delivery_fee: number;
  pricing: {
    base_fee: number;
    base_distance_km: number;
    extra_per_km: number;
    extra_km: number;
    subtotal_before_surge: number;
    surge_percent: number;
  };
  warning?: {
    code: string;
    message: string;
    description?: string | null;
    max_distance_km?: number | null;
    restriction_end_time?: string | null;
    timezone?: string | null;
    paused_zone_id?: number | null;
  };
};

export type QuoteDeliveryFeeFailure = {
  ok: false;
  status: number;
  msg: string;
  code?: string;
  retryable?: boolean;
  description?: string | null;
  max_distance_km?: number | null;
  restriction_end_time?: string | null;
  timezone?: string | null;
  paused_zone_id?: number | null;
  restaurant_id?: number;
  distance_km?: number;
  distance_source?: string;
};

export type QuoteDeliveryFeeResult = QuoteDeliveryFeeSuccess | QuoteDeliveryFeeFailure;

/**
 * Shared delivery-fee quote (tiered base + extra km) used by consumer checkout
 * and vendor/admin Request Gizra driver.
 */
export async function quoteDeliveryFeeForDestination(
  input: QuoteDeliveryFeeInput
): Promise<QuoteDeliveryFeeResult> {
  const applyFreeDelivery = input.applyFreeDelivery !== false;
  const enforceRestrictions = input.enforceRestrictions !== false;
  const destLat = Number(input.destinationLat);
  const destLng = Number(input.destinationLng);

  if (!Number.isFinite(destLat) || !Number.isFinite(destLng)) {
    return { ok: false, status: 403, msg: 'Invalid destination coordinates' };
  }

  const restaurant = await prisma.restaurants.findUnique({
    where: { id: BigInt(input.restaurantId) },
    select: {
      id: true,
      latitude: true,
      longitude: true,
      zone_id: true,
      self_delivery_system: true,
      minimum_shipping_charge: true,
      base_distance_km: true,
      per_km_shipping_charge: true,
      maximum_shipping_charge: true,
      delivery: true,
      free_delivery: true,
    },
  });

  if (!restaurant) {
    return { ok: false, status: 404, msg: 'Restaurant not found' };
  }

  if (!restaurant.delivery) {
    return { ok: false, status: 403, msg: 'Restaurant does not offer delivery' };
  }

  const origin = parseRestaurantCoordinates(restaurant.latitude, restaurant.longitude);
  if (!origin) {
    return { ok: false, status: 403, msg: 'Restaurant location is not configured' };
  }

  let distance_km: number;
  let distance_source: string;
  try {
    const resolved = await resolveDeliveryDistanceKm({
      originLat: origin.latitude,
      originLng: origin.longitude,
      destinationLat: destLat,
      destinationLng: destLng,
    });
    distance_km = resolved.distance_km;
    distance_source = resolved.source;
  } catch (err) {
    if (isDeliveryDistanceUnavailableError(err)) {
      return {
        ok: false,
        status: err.statusCode,
        msg: err.message,
        code: err.code,
        retryable: true,
        restaurant_id: Number(restaurant.id),
      };
    }
    throw err;
  }

  const emergencyPause = await evaluateEmergencyServicePause({
    orderType: 'delivery',
    restaurantZoneId: restaurant.zone_id != null ? Number(restaurant.zone_id) : null,
    destinationLat: destLat,
    destinationLng: destLng,
  });

  if (emergencyPause.blocked && enforceRestrictions) {
    return {
      ok: false,
      status: 403,
      msg: emergencyPause.message,
      code: EMERGENCY_SERVICE_PAUSED_CODE,
      description: emergencyPause.description,
      paused_zone_id: emergencyPause.paused_zone_id,
      restaurant_id: Number(restaurant.id),
    };
  }

  const timeRestrict = await evaluateDeliveryDistanceTimeRestriction({
    orderType: 'delivery',
    restaurantId: Number(restaurant.id),
    restaurantLat: restaurant.latitude,
    restaurantLng: restaurant.longitude,
    destinationLat: destLat,
    destinationLng: destLng,
    precomputedDistanceKm: distance_km,
  });

  const { pricing } = await resolveTieredDeliveryPricing(
    {
      zone_id: restaurant.zone_id,
      self_delivery_system: restaurant.self_delivery_system,
      minimum_shipping_charge: restaurant.minimum_shipping_charge,
      base_distance_km: restaurant.base_distance_km,
      per_km_shipping_charge: restaurant.per_km_shipping_charge,
      maximum_shipping_charge: restaurant.maximum_shipping_charge,
    },
    { latitude: String(destLat), longitude: String(destLng) }
  );

  const breakdown = computeTieredDeliveryFee(distance_km, pricing);

  let delivery_fee = breakdown.delivery_fee;
  const original_delivery_fee = breakdown.delivery_fee;
  if (applyFreeDelivery && restaurant.free_delivery) {
    delivery_fee = 0;
  }

  if (timeRestrict.blocked && enforceRestrictions) {
    return {
      ok: false,
      status: 403,
      msg: timeRestrict.message,
      code: DELIVERY_DISTANCE_TIME_RESTRICTED_CODE,
      description: timeRestrict.description,
      max_distance_km: timeRestrict.max_distance_km,
      restriction_end_time: timeRestrict.restriction_end_time,
      timezone: timeRestrict.timezone,
      restaurant_id: Number(restaurant.id),
      distance_km: breakdown.distance_km,
      distance_source,
    };
  }

  const success: QuoteDeliveryFeeSuccess = {
    ok: true,
    restaurant_id: Number(restaurant.id),
    distance_km: breakdown.distance_km,
    distance_source,
    delivery_fee,
    original_delivery_fee,
    pricing: {
      base_fee: breakdown.base_fee,
      base_distance_km: breakdown.base_distance_km,
      extra_per_km: breakdown.extra_per_km,
      extra_km: breakdown.extra_km,
      subtotal_before_surge: breakdown.subtotal_before_surge,
      surge_percent: breakdown.surge_percent,
    },
  };

  if (emergencyPause.blocked) {
    success.warning = {
      code: EMERGENCY_SERVICE_PAUSED_CODE,
      message: emergencyPause.message,
      description: emergencyPause.description,
      paused_zone_id: emergencyPause.paused_zone_id,
    };
  } else if (timeRestrict.blocked) {
    success.warning = {
      code: DELIVERY_DISTANCE_TIME_RESTRICTED_CODE,
      message: timeRestrict.message,
      description: timeRestrict.description,
      max_distance_km: timeRestrict.max_distance_km,
      restriction_end_time: timeRestrict.restriction_end_time,
      timezone: timeRestrict.timezone,
    };
  }

  return success;
}
