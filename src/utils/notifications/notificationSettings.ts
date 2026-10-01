import prisma from '../../config/database';

/** PHP `Helpers::getNotificationStatusData($userType, $key)->push_notification_status == 'active'`. */
export async function isPushNotificationEnabled(
  userType: 'admin' | 'customer' | 'restaurant' | 'deliveryman',
  key: string
): Promise<boolean> {
  const row = await prisma.notification_settings.findFirst({
    where: { type: userType, key },
    select: { push_notification_status: true },
  });
  return row?.push_notification_status === 'active';
}
