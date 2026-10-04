import { orders } from '@prisma/client';
import prisma from '../../config/database';
import { getManualDispatchBroadcastTopics } from '../deliveryman/pushTopics';
import { sendFcmToTopic, type FcmPushData } from './fcm';
import { isPushNotificationEnabled } from './notificationSettings';
import { persistUserNotification } from './persistUserNotification';

/**
 * PHP DispatchController extra push: manual orders have no vehicle_id, so notify
 * every vehicle topic in the zone plus the zone-wide topic.
 */
export async function notifyManualDispatchDriverPool(order: orders): Promise<void> {
  if (order.zone_id == null) return;

  const zoneId = Number(order.zone_id);
  if (!Number.isFinite(zoneId)) return;

  const orderId = order.id.toString();
  const pushData: FcmPushData = {
    title: 'Order notification',
    description: `New delivery request — Order ID: ${orderId}`,
    order_id: orderId,
    image: '',
    type: 'order_request',
    order_type: order.order_type,
  };

  const drivers = await prisma.delivery_men.findMany({
    where: {
      zone_id: zoneId,
      application_status: 'approved',
      status: true,
    },
    select: { id: true },
  });

  await Promise.all(
    drivers.map((dm) =>
      persistUserNotification({ delivery_man_id: Number(dm.id) }, pushData).catch((e) => {
        console.error('[notify] manual dispatch inbox save failed', e);
      })
    )
  );

  const enabled = await isPushNotificationEnabled('deliveryman', 'deliveryman_order_notification');
  if (!enabled) return;

  const topics = await getManualDispatchBroadcastTopics(zoneId);

  await Promise.all(
    topics.map((topic) =>
      sendFcmToTopic(topic, pushData).catch((e) => {
        console.error('[notify] manual dispatch topic push failed', e);
      })
    )
  );
}
