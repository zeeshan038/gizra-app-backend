import { computeDrivingRouteDistanceMeters } from '../consumer/googlePlaces';
import { redisGet, redisSetEx } from '../redis/client';
import { DeliveryDistanceUnavailableError } from './deliveryDistanceError';

export type DeliveryDistanceSource = 'google' | 'cache';

export type ResolveDeliveryDistanceResult = {
  distance_km: number;
  source: DeliveryDistanceSource;
};

export type ResolveDeliveryDistanceDeps = {
  getCached?: (key: string) => Promise<number | null>;
  setCached?: (key: string, km: number, ttlSeconds: number) => Promise<void>;
  fetchDrivingMeters?: (params: {
    originLat: number;
    originLng: number;
    destinationLat: number;
    destinationLng: number;
  }) => Promise<number>;
};

/** 30 minutes — shared by quote and place-order for consistent fees. */
export const DELIVERY_DISTANCE_CACHE_TTL_SECONDS = 30 * 60;

const CACHE_KEY_PREFIX = 'delivery:drive_km:v1';

/** ~1.1 m precision; keeps quote/place keys aligned for the same pin. */
export function roundCoordForCache(value: number): string {
  return (Math.round(value * 1e5) / 1e5).toFixed(5);
}

export function deliveryDistanceCacheKey(params: {
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
}): string {
  return [
    CACHE_KEY_PREFIX,
    roundCoordForCache(params.originLat),
    roundCoordForCache(params.originLng),
    roundCoordForCache(params.destinationLat),
    roundCoordForCache(params.destinationLng),
  ].join(':');
}

function metersToKm(meters: number): number {
  return Math.round((meters / 1000) * 1000) / 1000;
}

async function defaultGetCached(key: string): Promise<number | null> {
  const raw = await redisGet(key);
  if (raw == null) return null;
  const km = Number(raw);
  return Number.isFinite(km) && km >= 0 ? km : null;
}

async function defaultSetCached(key: string, km: number, ttlSeconds: number): Promise<void> {
  await redisSetEx(key, ttlSeconds, String(km));
}

/**
 * Authoritative delivery driving distance (Google Routes DRIVE) with Redis cache.
 * Never falls back to Haversine for billing — throws DeliveryDistanceUnavailableError.
 */
export async function resolveDeliveryDistanceKm(
  params: {
    originLat: number;
    originLng: number;
    destinationLat: number;
    destinationLng: number;
  },
  deps?: ResolveDeliveryDistanceDeps
): Promise<ResolveDeliveryDistanceResult> {
  const { originLat, originLng, destinationLat, destinationLng } = params;

  if (
    ![originLat, originLng, destinationLat, destinationLng].every(
      (n) => typeof n === 'number' && Number.isFinite(n)
    )
  ) {
    throw new DeliveryDistanceUnavailableError('Invalid coordinates for driving distance');
  }

  const getCached = deps?.getCached ?? defaultGetCached;
  const setCached = deps?.setCached ?? defaultSetCached;
  const fetchDrivingMeters = deps?.fetchDrivingMeters ?? computeDrivingRouteDistanceMeters;

  const cacheKey = deliveryDistanceCacheKey(params);

  try {
    const cachedKm = await getCached(cacheKey);
    if (cachedKm != null) {
      return {
        distance_km: Math.round(cachedKm * 1000) / 1000,
        source: 'cache',
      };
    }
  } catch (err) {
    console.warn(
      '[delivery-distance] cache read failed',
      err instanceof Error ? err.message : err
    );
  }

  let meters: number;
  try {
    meters = await fetchDrivingMeters({
      originLat,
      originLng,
      destinationLat,
      destinationLng,
    });
  } catch (err) {
    console.warn(
      '[delivery-distance] Google Routes failed',
      err instanceof Error ? err.message : err
    );
    throw new DeliveryDistanceUnavailableError();
  }

  if (typeof meters !== 'number' || !Number.isFinite(meters) || meters < 0) {
    throw new DeliveryDistanceUnavailableError();
  }

  const distance_km = metersToKm(meters);

  try {
    await setCached(cacheKey, distance_km, DELIVERY_DISTANCE_CACHE_TTL_SECONDS);
  } catch (err) {
    console.warn(
      '[delivery-distance] cache write failed',
      err instanceof Error ? err.message : err
    );
  }

  return { distance_km, source: 'google' };
}
