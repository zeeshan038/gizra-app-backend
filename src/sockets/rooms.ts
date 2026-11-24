export function restaurantRoom(restaurantId: number): string {
  return `restaurant:${restaurantId}`;
}

/**
 * Availability-only room (customers may join via watch_restaurant).
 * Kept separate from `restaurant:` so customers never receive new_order.
 */
export function restaurantAvailabilityRoom(restaurantId: number | string): string {
  return `restaurant_availability:${restaurantId}`;
}

export function orderRoom(orderId: number | string): string {
  return `order:${orderId}`;
}

export function userRoom(userId: number | string): string {
  return `user:${userId}`;
}

export function deliveryManRoom(deliveryManId: number | string): string {
  return `delivery_man:${deliveryManId}`;
}

export function vendorRoom(vendorId: number | string): string {
  return `vendor:${vendorId}`;
}

export function conversationRoom(conversationId: number | string): string {
  return `conversation:${conversationId}`;
}

/** Same string as FCM topic, prefixed so it cannot collide with `restaurant:` / `user:` rooms. */
export function fcmTopicRoom(topic: string): string {
  return `topic:${topic}`;
}
