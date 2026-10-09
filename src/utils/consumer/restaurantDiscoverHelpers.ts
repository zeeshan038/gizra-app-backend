import prisma from '../../config/database';
import { formatTime, toMinutes } from '../vendor/restaurantSetup/helpers';
import { distanceKm } from './favouriteHelpers';

/** Laravel `now()->dayOfWeek` — 0 (Sunday) through 6 (Saturday). */
export function currentScheduleDay(): number {
  return new Date().getDay();
}

function nowMinutesLocal(): number {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

export function isOpenFromSchedules(
  schedules: { opening_time: Date | null; closing_time: Date | null }[]
): boolean {
  if (!schedules.length) return false;
  const nowMin = nowMinutesLocal();
  for (const row of schedules) {
    const openStr = formatTime(row.opening_time);
    const closeStr = formatTime(row.closing_time);
    if (!openStr || !closeStr) continue;
    const openMin = toMinutes(openStr);
    const closeMin = toMinutes(closeStr);
    if (openMin <= closeMin) {
      if (nowMin >= openMin && nowMin < closeMin) return true;
    } else if (nowMin >= openMin || nowMin < closeMin) {
      return true;
    }
  }
  return false;
}

export async function loadTodaySchedulesByRestaurantId(
  restaurantIds: bigint[]
): Promise<Map<string, { opening_time: Date | null; closing_time: Date | null }[]>> {
  const map = new Map<string, { opening_time: Date | null; closing_time: Date | null }[]>();
  if (!restaurantIds.length) return map;

  const day = currentScheduleDay();
  const idDecimals = restaurantIds.map((id) => Number(id));

  const rows = await prisma.restaurant_schedule.findMany({
    where: {
      day: BigInt(day),
      restaurant_id: { in: idDecimals },
    },
    select: {
      restaurant_id: true,
      opening_time: true,
      closing_time: true,
    },
  });

  for (const row of rows) {
    const key = String(Number(row.restaurant_id));
    const list = map.get(key) ?? [];
    list.push({ opening_time: row.opening_time, closing_time: row.closing_time });
    map.set(key, list);
  }
  return map;
}

export const DISCOVER_RESTAURANT_SELECT = {
  id: true,
  name: true,
  logo: true,
  cover_photo: true,
  delivery_time: true,
  minimum_order: true,
  tax: true,
  rating: true,
  address: true,
  latitude: true,
  longitude: true,
  order_count: true,
} as const;

export type DiscoverRestaurantRow = {
  id: bigint;
  name: string;
  logo: string | null;
  cover_photo: string | null;
  delivery_time: string | null;
  minimum_order: unknown;
  tax: unknown;
  rating: string | null;
  address: string | null;
  latitude: string | null;
  longitude: string | null;
  order_count: bigint;
};

/** Home / discover cards (Popular, Latest, etc.). */
export function formatDiscoverRestaurant(
  r: DiscoverRestaurantRow,
  options?: { distanceKm?: number | null; open?: boolean }
) {
  const distance =
    options?.distanceKm != null
      ? Math.round(options.distanceKm * 100) / 100
      : null;

  return {
    id: r.id.toString(),
    name: r.name,
    logo: r.logo,
    cover_photo: r.cover_photo,
    delivery_time: r.delivery_time,
    minimum_order: r.minimum_order != null ? Number(r.minimum_order) : 0,
    tax: r.tax != null ? Number(r.tax) : 0,
    rating: r.rating != null ? Number(r.rating) : 0,
    address: r.address,
    latitude: r.latitude ?? null,
    longitude: r.longitude ?? null,
    order_count: Number(r.order_count),
    open: options?.open ?? false,
    distance,
    distance_text: distance != null ? `${distance} km` : null,
  };
}

export function parseDiscoverType(typeRaw: unknown): 'all' | 'veg' | 'non_veg' | 'home_delivery' | 'take_away' {
  const type = String(typeRaw ?? 'all').toLowerCase();
  if (type === 'veg' || type === 'non_veg' || type === 'home_delivery' || type === 'take_away') {
    return type;
  }
  return 'all';
}

export function applyDiscoverTypeFilter(
  where: Record<string, unknown>,
  type: ReturnType<typeof parseDiscoverType>
): void {
  if (type === 'veg') where.veg = true;
  else if (type === 'non_veg') where.non_veg = true;
  else if (type === 'home_delivery') where.delivery = true;
  else if (type === 'take_away') where.take_away = true;
}

export function distanceKmForRestaurant(
  coords: { lat: number; lng: number } | null,
  latitude: string | null,
  longitude: string | null
): number | null {
  if (!coords || !latitude || !longitude) return null;
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return distanceKm(coords.lat, coords.lng, lat, lng);
}

export function parseRestaurantCoordinates(
  latitude: string | null,
  longitude: string | null
): { latitude: number; longitude: number } | null {
  if (!latitude || !longitude) return null;
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { latitude: lat, longitude: lng };
}

export type MapBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

export function parseMapBoundsFromQuery(query: Record<string, unknown>): MapBounds | null {
  const minLat = Number(query.min_lat ?? query.minLat);
  const maxLat = Number(query.max_lat ?? query.maxLat);
  const minLng = Number(query.min_lng ?? query.minLng);
  const maxLng = Number(query.max_lng ?? query.maxLng);
  if (![minLat, maxLat, minLng, maxLng].every(Number.isFinite)) return null;
  if (minLat > maxLat || minLng > maxLng) return null;
  return { minLat, maxLat, minLng, maxLng };
}

export function isRestaurantInsideBounds(
  coords: { latitude: number; longitude: number },
  bounds: MapBounds
): boolean {
  return (
    coords.latitude >= bounds.minLat &&
    coords.latitude <= bounds.maxLat &&
    coords.longitude >= bounds.minLng &&
    coords.longitude <= bounds.maxLng
  );
}

/** Map markers — numeric lat/lng for Google/Apple Maps. */
export function formatMapRestaurant(
  r: DiscoverRestaurantRow,
  options?: { distanceKm?: number | null; open?: boolean }
) {
  const position = parseRestaurantCoordinates(r.latitude, r.longitude);
  const distance =
    options?.distanceKm != null
      ? Math.round(options.distanceKm * 100) / 100
      : null;

  return {
    id: r.id.toString(),
    name: r.name,
    logo: r.logo,
    rating: r.rating != null ? Number(r.rating) : 0,
    address: r.address,
    latitude: position?.latitude ?? null,
    longitude: position?.longitude ?? null,
    open: options?.open ?? false,
    distance,
    distance_text: distance != null ? `${distance} km` : null,
  };
}
