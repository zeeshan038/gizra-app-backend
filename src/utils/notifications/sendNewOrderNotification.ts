import prisma from '../../config/database';
import {
  emitDriverOrderRequestIfEligible,
  emitNewOrderRealtime,
} from '../../sockets/orderRealtime';
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
 * - Vendor `new_order` socket (restaurant room and vendor room)
 * - Driver `order_request` socket when the order is already in the delivery pool
 * - Persists `user_notifications` for the vendor panel
 * - Sends FCM to vendor devices and the driver pool when configured
 */
export async function sendNewOrderNotification(
  payload: NewOrderPushPayload,
  options?: { skipVendorSocket?: boolean }
): Promise<void> {
  if (!options?.skipVendorSocket) {
    emitNewOrderRealtime({
      order_id: payload.order_id,
      restaurant_id: payload.restaurant_id,
      order_amount: payload.order_amount,
      order_type: payload.order_type,
      payment_method: payload.payment_method,
      vendor_id: payload.vendor_id,
    });
  }

  try {
    const order = await prisma.orders.findUnique({
      where: { id: BigInt(payload.order_id) },
    });
    if (order) await emitDriverOrderRequestIfEligible(order);
  } catch (e) {
    console.error('[socket] driver order_request on new order failed', e);
  }

  try {
    const vendor = await prisma.vendors.findUnique({
      where: { id: BigInt(payload.vendor_id) },
      select: { firebase_token: true, fcm_token_web: true, is_notification_on: true },
    });
    await persistAndPushVendorNewOrder({
      order_id: payload.order_id,
      vendor_id: payload.vendor_id,
      restaurant_id: payload.restaurant_id,
      order_type: payload.order_type,
      vendorTokens: {
        firebase_token: vendor?.firebase_token,
        fcm_token_web: vendor?.fcm_token_web,
      },
      recipientPushOn: vendor?.is_notification_on,
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
