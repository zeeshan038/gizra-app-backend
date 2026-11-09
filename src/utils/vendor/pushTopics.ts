/** FCM topic for new-order / message pushes to one restaurant POS (legacy PHP parity). */
export function vendorRestaurantMessageTopic(restaurantId: number): string {
  return `restaurant_panel_${restaurantId}_message`;
}

/** Topics the POS app must subscribe to after FCM token registration — not zone-wide restaurant topics. */
export function getVendorFcmSubscribeTopics(restaurantId: number | null | undefined): string[] {
  if (restaurantId == null || !Number.isFinite(Number(restaurantId)) || Number(restaurantId) <= 0) {
    return [];
  }
  return [vendorRestaurantMessageTopic(Number(restaurantId))];
}
