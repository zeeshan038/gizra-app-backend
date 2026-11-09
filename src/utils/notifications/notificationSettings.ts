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
    if (userType === 'customer' && key === 'customer_order_notification') {
      return true;
    }
    if (userType === 'deliveryman' && key === 'deliveryman_order_notification') {
      return true;
    }
    if (userType === 'admin' && key === 'withdraw_request') {
      return true;
    }
    if (
      userType === 'restaurant' &&
      (key === 'restaurant_withdraw_approve' || key === 'restaurant_withdraw_rejaction')
    ) {
      return true;
    }
    if (
      userType === 'deliveryman' &&
      (key === 'deliveryman_withdraw_approve' ||
        key === 'deliveryman_withdraw_rejaction' ||
        key === 'deliveryman_withdraw_rejection')
    ) {
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
    if (key === 'restaurant_withdraw_approve' || key === 'restaurant_withdraw_rejaction') {
      return true;
    }
    return false;
  }
  return row.push_notification_status === 'active';
}

/** PHP `restaurantNotificationDataSetup` — missing row defaults push on for new orders. */
export async function ensureRestaurantOrderPushSetup(restaurantId: number): Promise<void> {
  if (!Number.isFinite(restaurantId) || restaurantId <= 0) return;
  const key = 'restaurant_order_notification';
  const existing = await prisma.restaurant_notification_settings.findFirst({
    where: { key, restaurant_id: new Prisma.Decimal(restaurantId) },
    select: { id: true },
  });
  if (existing) return;
  await prisma.restaurant_notification_settings.create({
    data: {
      title: 'restaurant_order_notification',
      sub_title: 'Get_notification_on_restaurant_order_notification',
      key,
      restaurant_id: new Prisma.Decimal(restaurantId),
      mail_status: 'disable',
      sms_status: 'disable',
      push_notification_status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    },
  });
}

/** Vendor device push requires platform + per-restaurant toggles (PHP parity). */
export async function isVendorPushEnabled(restaurantId: number, key: string): Promise<boolean> {
  const [platform, restaurant] = await Promise.all([
    isPushNotificationEnabled('restaurant', key),
    isRestaurantPushNotificationEnabled(restaurantId, key),
  ]);
  return platform && restaurant;
}

/**
 * Incoming customer orders (POS) — same gate as driver/customer: **platform** `notification_settings` only.
 * `restaurant_notification_settings` often has `push_notification_status = disable` after MySQL migration
 * even when admin expects pushes on; that table is restaurant-panel prefs, not the operational new-order FCM gate.
 */
export async function isVendorNewOrderPushEnabled(): Promise<boolean> {
  return isPushNotificationEnabled('restaurant', 'restaurant_order_notification');
}

export async function vendorPushBlockReason(
  restaurantId: number,
  key: string
): Promise<string | null> {
  const [platform, restaurant] = await Promise.all([
    isPushNotificationEnabled('restaurant', key),
    isRestaurantPushNotificationEnabled(restaurantId, key),
  ]);
  if (platform && restaurant) return null;
  if (!platform) return `platform_notification_settings_off:${key}`;
  return `restaurant_notification_settings_off:restaurant=${restaurantId},key=${key}`;
}

/** PHP `getNotificationStatusData(...)->sms_status == 'active'`. */
export async function isSmsNotificationEnabled(
  userType: NotificationUserType,
  key: string
): Promise<boolean> {
  const row = await prisma.notification_settings.findFirst({
    where: { type: userType, key },
    select: { sms_status: true },
  });
  if (!row) {
    if (userType === 'customer' && key === 'customer_order_notification') {
      return true;
    }
    return false;
  }
  return row.sms_status === 'active';
}
