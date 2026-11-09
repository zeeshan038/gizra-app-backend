import prisma from '../../config/database';
import { resolveDeliveryDistanceKm } from './deliveryDistanceKm';
import { parseRestaurantCoordinates } from '../consumer/restaurantDiscoverHelpers';

const FIXED_IANA_TIMEZONE = 'Asia/Jerusalem';

export const DELIVERY_DISTANCE_TIME_RESTRICTED_CODE = 'DELIVERY_DISTANCE_TIME_RESTRICTED';

export type DeliveryDistanceTimeRestrictionStatus =
  | 'disabled'
  | 'enabled_outside_hours'
  | 'active';

export type DeliveryDistanceTimeRestrictionRow = {
  id: bigint;
  enabled: boolean;
  max_distance_km: unknown;
  start_time: string;
  end_time: string;
  timezone: string;
  description: string | null;
  created_at: Date | null;
  updated_at: Date | null;
  updated_by_admin_id: bigint | null;
  restaurants: Array<{ restaurant_id: bigint }>;
};

function normalizeAdminDescription(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  return s.length ? s : null;
}

/** Customer-facing text when restriction blocks delivery (admin description or default). */
export function buildDeliveryRestrictionBlockedMessage(
  maxKm: number,
  adminDescription: string | null | undefined
): { msg: string; description: string | null } {
  const description = normalizeAdminDescription(adminDescription);
  if (description) {
    return { msg: description, description };
  }
  const msg = `Delivery is temporarily limited to ${maxKm} km during restricted hours.`;
  return { msg, description: null };
}

let configCache: { row: DeliveryDistanceTimeRestrictionRow | null; loadedAt: number } | null = null;
const CONFIG_TTL_MS = 5000;

export function invalidateDeliveryDistanceTimeRestrictionCache(): void {
  configCache = null;
}

async function loadConfigRow(): Promise<DeliveryDistanceTimeRestrictionRow | null> {
  const row = await prisma.delivery_distance_time_restriction_configs.findFirst({
    orderBy: { id: 'asc' },
    include: {
      restaurants: { select: { restaurant_id: true } },
    },
  });
  if (!row) return null;
  return row as DeliveryDistanceTimeRestrictionRow;
}

export async function getDeliveryDistanceTimeRestrictionConfig(): Promise<DeliveryDistanceTimeRestrictionRow | null> {
  const now = Date.now();
  if (configCache && now - configCache.loadedAt < CONFIG_TTL_MS) {
    return configCache.row;
  }
  const row = await loadConfigRow();
  configCache = { row, loadedAt: now };
  return row;
}

/** Wall-clock minutes [0, 1439] in IANA zone (handles Israel DST). */
export function wallClockMinutesInZone(date: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  return hour * 60 + minute;
}

/** Parse "HH:mm" or "H:mm" to minutes 0-1439. */
export function parseTimeToMinutes(s: string): number | null {
  const m = String(s).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function formatMinutesAsHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Inclusive start, inclusive end at minute precision.
 * Overnight when start > end (e.g. 22:00–06:00).
 */
export function isNowWithinRestrictionWindow(
  now: Date,
  startTime: string,
  endTime: string,
  timeZone: string
): boolean {
  const startM = parseTimeToMinutes(startTime);
  const endM = parseTimeToMinutes(endTime);
  if (startM == null || endM == null) return false;
  const nowM = wallClockMinutesInZone(now, timeZone);

  if (startM <= endM) {
    return nowM >= startM && nowM <= endM;
  }
  return nowM >= startM || nowM <= endM;
}

export function resolveRestrictionEffectiveStatus(
  config: DeliveryDistanceTimeRestrictionRow | null,
  now: Date = new Date()
): {
  status: DeliveryDistanceTimeRestrictionStatus;
  in_window: boolean;
  restaurant_in_scope: boolean;
} {
  if (!config || !config.enabled) {
    return { status: 'disabled', in_window: false, restaurant_in_scope: false };
  }
  const tz = config.timezone?.trim() || FIXED_IANA_TIMEZONE;
  const inWindow = isNowWithinRestrictionWindow(now, config.start_time, config.end_time, tz);
  if (!inWindow) {
    return { status: 'enabled_outside_hours', in_window: false, restaurant_in_scope: false };
  }
  return { status: 'active', in_window: true, restaurant_in_scope: false };
}

export async function getRestrictionEffectiveForRestaurant(
  restaurantId: number,
  now: Date = new Date()
): Promise<{
  status: DeliveryDistanceTimeRestrictionStatus;
  in_window: boolean;
  applies: boolean;
  max_distance_km: number | null;
  restriction_end_time: string;
  timezone: string;
}> {
  const config = await getDeliveryDistanceTimeRestrictionConfig();
  const tz = config?.timezone?.trim() || FIXED_IANA_TIMEZONE;
  const endDisplay = config?.end_time ?? '20:30';

  if (!config || !config.enabled) {
    return {
      status: 'disabled',
      in_window: false,
      applies: false,
      max_distance_km: null,
      restriction_end_time: endDisplay,
      timezone: tz,
    };
  }

  const inWindow = isNowWithinRestrictionWindow(now, config.start_time, config.end_time, tz);
  const selected = new Set(config.restaurants.map((r) => Number(r.restaurant_id)));
  const restaurantIncluded = selected.has(Number(restaurantId));

  if (!inWindow) {
    return {
      status: 'enabled_outside_hours',
      in_window: false,
      applies: false,
      max_distance_km: Number(config.max_distance_km),
      restriction_end_time: endDisplay,
      timezone: tz,
    };
  }

  if (!restaurantIncluded) {
    return {
      status: 'active',
      in_window: true,
      applies: false,
      max_distance_km: Number(config.max_distance_km),
      restriction_end_time: endDisplay,
      timezone: tz,
    };
  }

  return {
    status: 'active',
    in_window: true,
    applies: true,
    max_distance_km: Number(config.max_distance_km),
    restriction_end_time: endDisplay,
    timezone: tz,
  };
}

export type DistanceCheckResult =
  | { ok: true; distance_km: number; source: 'google' | 'haversine' }
  | { ok: false; reason: 'origin' | 'destination' };

/**
 * Server-authoritative km from restaurant to destination (Google + haversine fallback).
 */
export async function computeAuthoritativeDeliveryKm(params: {
  restaurantLat: string | null;
  restaurantLng: string | null;
  destinationLat: number;
  destinationLng: number;
}): Promise<DistanceCheckResult> {
  const origin = parseRestaurantCoordinates(params.restaurantLat, params.restaurantLng);
  if (!origin) {
    return { ok: false, reason: 'origin' };
  }
  if (!Number.isFinite(params.destinationLat) || !Number.isFinite(params.destinationLng)) {
    return { ok: false, reason: 'destination' };
  }

  const resolved = await resolveDeliveryDistanceKm({
    originLat: origin.latitude,
    originLng: origin.longitude,
    destinationLat: params.destinationLat,
    destinationLng: params.destinationLng,
  });
  return { ok: true, distance_km: resolved.distance_km, source: resolved.source };
}

const KM_EPS = 1e-6;

export function isDistanceOverMax(distanceKm: number, maxKm: number): boolean {
  return distanceKm - maxKm > KM_EPS;
}

export type BlockResult = {
  blocked: true;
  message: string;
  description: string | null;
  max_distance_km: number;
  restriction_end_time: string;
  timezone: string;
} | { blocked: false };

export async function evaluateDeliveryDistanceTimeRestriction(params: {
  orderType: string;
  restaurantId: number;
  restaurantLat: string | null;
  restaurantLng: string | null;
  destinationLat: number;
  destinationLng: number;
  /** Use schedule time for scheduled orders (restriction applies at scheduled delivery time). */
  evaluationTime?: Date;
  /** When set, skip second distance API call (same authoritative km as fees). */
  precomputedDistanceKm?: number;
}): Promise<BlockResult> {
  if (params.orderType !== 'delivery') {
    return { blocked: false };
  }

  const config = await getDeliveryDistanceTimeRestrictionConfig();
  const now = params.evaluationTime ?? new Date();
  const tz = config?.timezone?.trim() || FIXED_IANA_TIMEZONE;

  if (!config || !config.enabled) {
    return { blocked: false };
  }

  const selected = new Set(config.restaurants.map((r) => Number(r.restaurant_id)));
  if (!selected.has(Number(params.restaurantId))) {
    return { blocked: false };
  }

  if (!isNowWithinRestrictionWindow(now, config.start_time, config.end_time, tz)) {
    return { blocked: false };
  }

  const maxKm = Number(config.max_distance_km);
  if (!Number.isFinite(maxKm) || maxKm <= 0) {
    return { blocked: false };
  }

  let distanceKm: number;
  if (params.precomputedDistanceKm != null && Number.isFinite(params.precomputedDistanceKm)) {
    distanceKm = params.precomputedDistanceKm;
  } else {
    const dist = await computeAuthoritativeDeliveryKm({
      restaurantLat: params.restaurantLat,
      restaurantLng: params.restaurantLng,
      destinationLat: params.destinationLat,
      destinationLng: params.destinationLng,
    });

    if (!dist.ok) {
      return {
        blocked: true,
        message: 'Delivery distance could not be verified. Check addresses.',
        description: null,
        max_distance_km: maxKm,
        restriction_end_time: config.end_time,
        timezone: tz,
      };
    }
    distanceKm = dist.distance_km;
  }

  if (isDistanceOverMax(distanceKm, maxKm)) {
    const { msg, description } = buildDeliveryRestrictionBlockedMessage(maxKm, config.description);
    return {
      blocked: true,
      message: msg,
      description,
      max_distance_km: maxKm,
      restriction_end_time: config.end_time,
      timezone: tz,
    };
  }

  return { blocked: false };
}

export { FIXED_IANA_TIMEZONE };
