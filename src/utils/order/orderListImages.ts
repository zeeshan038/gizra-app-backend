import { publicFoodMediaUrl, publicMediaUrl, publicRestaurantMediaUrl } from '../mediaStorage';

/** Order list / history thumbnail — food path from DB or snapshot. */
export function resolveOrderListFoodImageUrl(
  stored: string | null | undefined
): string | null {
  return publicFoodMediaUrl(stored);
}

/** Fallback when an order has no line items (manual dispatch) or no food image. */
export function resolveOrderListRestaurantLogoUrl(
  stored: string | null | undefined
): string | null {
  return publicRestaurantMediaUrl(stored, 'logo');
}

export function resolveDriverOrderHistoryImage(
  foodImageStored: string | null | undefined,
  restaurantLogoStored: string | null | undefined
): string | null {
  if (foodImageStored?.trim()) {
    return resolveOrderListFoodImageUrl(foodImageStored);
  }
  const logo = resolveOrderListRestaurantLogoUrl(restaurantLogoStored);
  if (logo) return logo;
  return resolveOrderListRestaurantLogoUrl('default_logo.png');
}

/** Driver profile / customer avatar on order cards. */
export function resolveDriverOrderPartyImageUrl(
  stored: string | null | undefined,
  fallbackFilename: string
): string | null {
  const raw = stored?.trim() || fallbackFilename;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return publicMediaUrl(raw);
}
