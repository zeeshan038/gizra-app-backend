import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import type { FcmPushData } from './fcm';

export type UserNotificationOwner = {
  user_id?: number;
  vendor_id?: number;
  delivery_man_id?: number;
};

/** Always persist inbox rows — independent of FCM success or push settings. */
export async function persistUserNotification(
  owner: UserNotificationOwner,
  data: FcmPushData
): Promise<void> {
  const now = new Date();
  await prisma.user_notifications.create({
    data: {
      data: JSON.stringify(data),
      status: true,
      user_id: owner.user_id != null ? new Prisma.Decimal(owner.user_id) : undefined,
      vendor_id: owner.vendor_id != null ? new Prisma.Decimal(owner.vendor_id) : undefined,
      delivery_man_id:
        owner.delivery_man_id != null ? new Prisma.Decimal(owner.delivery_man_id) : undefined,
      created_at: now,
      updated_at: now,
    },
  });
}
