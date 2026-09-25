import { Request } from 'express';

/**
 * Legacy mobile apps send header `zoneId` as JSON array string, e.g. `"[1,2]"`.
 */
export function parseZoneIdsFromRequest(req: Request): number[] | null {
  const raw = req.headers.zoneid ?? req.headers.zoneId;
  if (raw == null || raw === '') return null;
  const str = String(raw);
  try {
    const parsed = JSON.parse(str);
    if (Array.isArray(parsed)) {
      return parsed.map((z) => Number(z)).filter((z) => Number.isFinite(z));
    }
    const single = Number(parsed);
    return Number.isFinite(single) ? [single] : null;
  } catch {
    const single = Number(str);
    return Number.isFinite(single) ? [single] : null;
  }
}

/** Customer location from headers (same as legacy customer APIs). */
export function parseCoordinatesFromRequest(req: Request): { lat: number; lng: number } | null {
  const latRaw = req.headers.latitude ?? req.query.latitude;
  const lngRaw = req.headers.longitude ?? req.query.longitude;
  if (latRaw == null || lngRaw == null) return null;
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function distanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function discountedPrice(price: number, discount: number, discountType: string): number {
  if (discount <= 0) return price;
  if (discountType === 'percent') {
    return Math.round((price - (price * discount) / 100) * 100) / 100;
  }
  return Math.max(0, Math.round((price - discount) * 100) / 100);
}

type RestaurantSnippet = {
  id: bigint;
  name: string;
  logo: string | null;
  address: string | null;
  latitude: string | null;
  longitude: string | null;
  delivery_time: string | null;
  cover_photo?: string | null;
  rating?: string | null;
};

/** Figma Foods tab: item + restaurant name + price. */
export function formatFavouriteFood(
  f: {
    id: bigint;
    name: string | null;
    description: string | null;
    image: string | null;
    category_id: unknown;
    restaurant_id: unknown;
    price: unknown;
    discount: unknown;
    discount_type?: string;
    veg: boolean;
    status: boolean;
    variations: string | null;
    add_ons: string | null;
    avg_rating?: number;
    rating_count?: bigint | number;
  },
  restaurant?: RestaurantSnippet | null,
  wishlistId?: bigint
) {
  let variations: unknown[] = [];
  let add_ons: unknown[] = [];
  try {
    if (f.variations) variations = JSON.parse(f.variations);
  } catch {
    /* ignore */
  }
  try {
    if (f.add_ons) add_ons = JSON.parse(f.add_ons);
  } catch {
    /* ignore */
  }

  const basePrice = Number(f.price);
  const discount = Number(f.discount) || 0;
  const discountType = f.discount_type ?? 'percent';
  const price = discountedPrice(basePrice, discount, discountType);

  return {
    id: f.id.toString(),
    wishlist_id: wishlistId?.toString() ?? null,
    name: f.name,
    description: f.description,
    image: f.image,
    category_id: f.category_id != null ? String(f.category_id) : null,
    restaurant_id: f.restaurant_id != null ? String(f.restaurant_id) : null,
    restaurant_name: restaurant?.name ?? null,
    restaurant_logo: restaurant?.logo ?? null,
    restaurant_address: restaurant?.address ?? null,
    price: basePrice,
    price_after_discount: price,
    discount,
    discount_type: discountType,
    avg_rating: f.avg_rating ?? 0,
    rating_count: f.rating_count != null ? Number(f.rating_count) : 0,
    veg: f.veg,
    status: f.status,
    is_favourite: true,
    variations,
    add_ons,
  };
}

/** Figma Restaurants tab: cover, logo, distance badge, delivery time. */
export function formatFavouriteRestaurant(
  r: {
    id: bigint;
    name: string;
    logo: string | null;
    cover_photo: string | null;
    delivery_time: string | null;
    minimum_order: unknown;
    tax: unknown;
    rating: string | null;
    address: string | null;
    zone_id: unknown;
    latitude?: string | null;
    longitude?: string | null;
    foods_count?: number;
  },
  options?: { distanceKm?: number | null; wishlistId?: bigint }
) {
  const distance =
    options?.distanceKm != null
      ? Math.round(options.distanceKm * 100) / 100
      : null;

  return {
    id: r.id.toString(),
    wishlist_id: options?.wishlistId?.toString() ?? null,
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
    zone_id: r.zone_id != null ? String(r.zone_id) : null,
    foods_count: r.foods_count,
    distance,
    distance_text: distance != null ? `${distance} km` : null,
    is_favourite: true,
  };
}

export function matchesSearch(name: string | null | undefined, search: string): boolean {
  if (!search.trim()) return true;
  return (name ?? '').toLowerCase().includes(search.trim().toLowerCase());
}
