export function restaurantRoom(restaurantId: number): string {
  return `restaurant:${restaurantId}`;
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
