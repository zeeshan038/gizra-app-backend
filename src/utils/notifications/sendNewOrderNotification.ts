import prisma from '../../config/database';
import { emitNewOrderRealtime } from '../../sockets/orderRealtime';
import { persistAndPushVendorNewOrder, sendOrderNotification } from './sendOrderNotification';

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
  emitNewOrderRealtime({
    order_id: payload.order_id,
    restaurant_id: payload.restaurant_id,
    order_amount: payload.order_amount,
    order_type: payload.order_type,
    payment_method: payload.payment_method,
  });

  try {
    const vendor = await prisma.vendors.findUnique({
      where: { id: BigInt(payload.vendor_id) },
      select: { firebase_token: true, fcm_token_web: true },
    });
    const deviceToken = vendor?.firebase_token || vendor?.fcm_token_web;
    await persistAndPushVendorNewOrder({
      order_id: payload.order_id,
      vendor_id: payload.vendor_id,
      restaurant_id: payload.restaurant_id,
      order_type: payload.order_type,
      deviceToken,
    });
  } catch (e) {
    console.error('[notify] vendor new order failed', e);
  }

  try {
    await sendOrderNotification(BigInt(payload.order_id));
  } catch (e) {
    console.error('[notify] sendOrderNotification failed', e);
  }
}
