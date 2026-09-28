export type SocketActor =
  | { role: 'vendor'; vendorId: number; restaurantId: number }
  | { role: 'customer'; userId: number }
  | { role: 'delivery_man'; deliveryManId: number };

export type SocketJwtPayload = {
  id?: string;
  _id?: string;
  role?: string;
  restaurant_id?: string;
};
