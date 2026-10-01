import prisma from '../../config/database';
import { emitNewOrderRealtime } from '../../sockets/orderRealtime';
import { sendFcmToDevice } from './fcm';
import { notifyDeliveryMenForOrder } from './sendDriverOrderNotification';

export type NewOrderPushPayload = {
  order_id: string;
  restaurant_id: number;
  vendor_id: number;
  order_type: string;
  payment_method: string | null;
  order_amount: number;
};

/**
 * Mirrors legacy `Helpers::send_order_notification` for new marketplace orders (vendor leg):
 * - Persists `user_notifications` for the vendor panel
 * - Sends FCM to vendor `firebase_token` (POS / vendor mobile app) when configured
 * - Driver pool FCM when the placed order is immediately pool-eligible
 */
export async function sendNewOrderNotification(payload: NewOrderPushPayload): Promise<void> {
  const data = {
    title: 'New order',
    description: `New order received — Order ID: ${payload.order_id}`,
    order_id: payload.order_id,
    image: '',
    type: 'new_order',
    order_type: payload.order_type,
  };

  emitNewOrderRealtime({
    order_id: payload.order_id,
    restaurant_id: payload.restaurant_id,
    order_amount: payload.order_amount,
    order_type: payload.order_type,
    payment_method: payload.payment_method,
  });

  try {
    await prisma.user_notifications.create({
      data: {
        vendor_id: payload.vendor_id,
        data: JSON.stringify(data),
        status: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    });
  } catch (e) {
    console.error('[notify] failed to save user_notifications', e);
  }

  try {
    const vendor = await prisma.vendors.findUnique({
      where: { id: BigInt(payload.vendor_id) },
      select: { firebase_token: true, fcm_token_web: true },
    });

    const deviceToken = vendor?.firebase_token || vendor?.fcm_token_web;
    if (deviceToken) {
      await sendFcmToDevice(deviceToken, data);
    }
  } catch (e) {
    console.error('[notify] FCM send failed', e);
  }

  try {
    const order = await prisma.orders.findUnique({
      where: { id: BigInt(payload.order_id) },
    });
    if (order) {
      await notifyDeliveryMenForOrder(order);
    }
  } catch (e) {
    console.error('[notify] driver pool FCM failed', e);
  }
}
