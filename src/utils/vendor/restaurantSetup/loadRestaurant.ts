import { Request } from 'express';
import prisma from '../../../config/database';
import {
  VendorRestaurantLoadResult,
  VendorRestaurantRow,
} from '../../../types/vendor/restaurantSetup';
import { getVendorContext } from '../context';

export async function loadVendorRestaurant(
  req: Request
): Promise<VendorRestaurantLoadResult | null> {
  const ctx = getVendorContext(req);
  if (!ctx) return null;
  const restaurant = await prisma.restaurants.findUnique({
    where: { id: BigInt(ctx.restaurantId) },
  });
  if (!restaurant) return null;
  return { ctx, restaurant };
}

export async function ensureRestaurantConfig(restaurantId: number) {
  const existing = await prisma.restaurant_configs.findFirst({
    where: { restaurant_id: restaurantId },
  });
  if (existing) return existing;
  return prisma.restaurant_configs.create({
    data: {
      restaurant_id: restaurantId,
      created_at: new Date(),
      updated_at: new Date(),
    },
  });
}

export async function selfDeliveryEnabled(
  restaurant: Pick<VendorRestaurantRow, 'restaurant_model' | 'self_delivery_system'>,
  restaurantId: number
) {
  if (restaurant.restaurant_model === 'commission') return restaurant.self_delivery_system;
  if (restaurant.restaurant_model !== 'subscription') return false;
  const sub = await prisma.restaurant_subscriptions.findFirst({
    where: { restaurant_id: restaurantId, status: true },
    orderBy: { id: 'desc' },
  });
  return Boolean(sub?.self_delivery);
}
