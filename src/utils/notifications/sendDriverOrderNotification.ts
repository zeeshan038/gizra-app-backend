import { orders, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import {
  getOrderRequestBroadcastTopics,
  shouldEmitDriverOrderRequest,
} from '../deliveryman/pushTopics';
import {
  passesNotDigitalPending,
  passesScheduleWindow,
} from '../deliveryman/orderHelpers';
import { isPushNotificationEnabled } from './notificationSettings';
import { sendFcmToDevice, sendFcmToTopic } from './fcm';

const ORDER_PUSH_TITLE = 'Order notification';

function orderRequestDescription(orderId: string): string {
  return `New delivery request — Order ID: ${orderId}`;
}

function assignedStatusDescription(status: string): string {
  if (status === 'processing') return 'Proceed for cooking / pickup when ready';
  if (status === 'handover') return 'Order is ready for delivery';
  return `Order status: ${status}`;
}

/**
 * Driver FCM for pool (`order_request` topics) and assigned order status — subset of PHP `send_order_notification`.
 */
export async function notifyDeliveryMenForOrder(order: orders): Promise<void> {
  const enabled = await isPushNotificationEnabled('deliveryman', 'deliveryman_order_notification');
  if (!enabled) return;

  const orderId = order.id.toString();

  if (
    passesScheduleWindow(order, 30) &&
    passesNotDigitalPending(order) &&
    (await shouldEmitDriverOrderRequest(order))
  ) {
    const topics = await getOrderRequestBroadcastTopics(order);
    const pushData = {
      title: ORDER_PUSH_TITLE,
      description: orderRequestDescription(orderId),
      order_id: orderId,
      image: '',
      type: 'order_request',
      order_type: order.order_type,
    };

    await Promise.all(topics.map((topic) => sendFcmToTopic(topic, pushData)));
  }

  if (
    order.delivery_man_id != null &&
    ['processing', 'handover'].includes(order.order_status)
  ) {
    const dm = await prisma.delivery_men.findUnique({
      where: { id: BigInt(Number(order.delivery_man_id)) },
      select: { id: true, fcm_token: true },
    });

    if (!dm?.fcm_token?.trim()) return;

    const pushData = {
      title: ORDER_PUSH_TITLE,
      description: assignedStatusDescription(order.order_status),
      order_id: orderId,
      image: '',
      type: 'order_status',
      order_status: order.order_status,
    };

    await sendFcmToDevice(dm.fcm_token, pushData);

    try {
      await prisma.user_notifications.create({
        data: {
          delivery_man_id: new Prisma.Decimal(Number(dm.id)),
          data: JSON.stringify(pushData),
          status: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      });
    } catch (e) {
      console.error('[notify] failed to save delivery_man user_notifications', e);
    }
  }
}
