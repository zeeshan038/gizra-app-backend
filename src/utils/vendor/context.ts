import { Request } from 'express';

export type VendorRequestContext = {
  vendorId: number;
  restaurantId: number;
};

/** Resolved from JWT + vendor middleware (`restaurant_id` on `req.user`). */
export function getVendorContext(req: Request): VendorRequestContext | null {
  const user = req.user as { id?: string; restaurant_id?: number | null };
  const vendorId = Number(user?.id);
  const restaurantId = Number(user?.restaurant_id);
  if (!vendorId || !restaurantId) return null;
  return { vendorId, restaurantId };
}
