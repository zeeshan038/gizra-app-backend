import { Prisma } from '@prisma/client';
import prisma from '../../config/database';

type NotificationUserType = 'admin' | 'customer' | 'restaurant' | 'deliveryman';

/** PHP `Helpers::getNotificationStatusData($userType, $key)->push_notification_status == 'active'`. */
export async function isPushNotificationEnabled(
  userType: NotificationUserType,
  key: string
): Promise<boolean> {
  const row = await prisma.notification_settings.findFirst({
    where: { type: userType, key },
    select: { push_notification_status: true },
  });
  if (!row) {
    // Fresh DBs may lack seeds; default new-order pushes on for vendors (legacy had row id 28 active).
    if (userType === 'restaurant' && key === 'restaurant_order_notification') {
      return true;
    }
    return false;
  }
  return row.push_notification_status === 'active';
}

/** PHP `getRestaurantNotificationStatusData($restaurantId, $key)` — auto-setup defaults push active for new orders. */
export async function isRestaurantPushNotificationEnabled(
  restaurantId: number,
  key: string
): Promise<boolean> {
  const row = await prisma.restaurant_notification_settings.findFirst({
    where: {
      key,
      restaurant_id: new Prisma.Decimal(restaurantId),
    },
    select: { push_notification_status: true },
  });
  if (!row) {
    if (key === 'restaurant_order_notification') {
      return true;
    }
    return false;
  }
  return row.push_notification_status === 'active';
}

/** Vendor device push requires platform + per-restaurant toggles (PHP parity). */
export async function isVendorPushEnabled(restaurantId: number, key: string): Promise<boolean> {
  const [platform, restaurant] = await Promise.all([
    isPushNotificationEnabled('restaurant', key),
    isRestaurantPushNotificationEnabled(restaurantId, key),
  ]);
  return platform && restaurant;
}
