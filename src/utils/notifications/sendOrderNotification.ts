import { orders } from '@prisma/client';
import prisma from '../../config/database';
import {
  getOrderRequestBroadcastTopics,
  shouldEmitDriverOrderRequest,
} from '../deliveryman/pushTopics';
import {
  passesNotDigitalPending,
  passesScheduleWindow,
} from '../deliveryman/orderHelpers';
import { sendFcmToDevice, sendFcmToTopic, type FcmPushData } from './fcm';
import {
  isPushNotificationEnabled,
  isVendorPushEnabled,
} from './notificationSettings';
import { buildOrderStatusDescription } from './orderStatusMessage';
import { persistUserNotification } from './persistUserNotification';
import { isRecipientPushOn } from './pushNotificationPreference';

const ORDER_PUSH_TITLE = 'Order notification';

export type VendorPushTargets = {
  firebase_token?: string | null;
  fcm_token_web?: string | null;
};

function uniqueDeviceTokens(targets: VendorPushTargets): string[] {
  const mobile = targets.firebase_token?.trim();
  const web = targets.fcm_token_web?.trim();
  return [...new Set([mobile, web].filter(Boolean) as string[])];
}

async function pushToDeviceIfEnabled(
  enabled: boolean,
  token: string | null | undefined,
  data: FcmPushData
): Promise<void> {
  if (!enabled || !token?.trim()) return;
  try {
    await sendFcmToDevice(token, data);
  } catch (e) {
    console.error('[notify] FCM device send failed', e);
  }
}

async function loadOrderContext(order: orders) {
  const restaurant = await prisma.restaurants.findUnique({
    where: { id: BigInt(Number(order.restaurant_id)) },
    select: { id: true, name: true, vendor_id: true, zone_id: true },
  });

  const [vendor, customer, guest, deliveryMan] = await Promise.all([
    restaurant?.vendor_id
      ? prisma.vendors.findUnique({
          where: { id: BigInt(Number(restaurant.vendor_id)) },
          select: {
            id: true,
            firebase_token: true,
            fcm_token_web: true,
            is_notification_on: true,
          },
        })
      : Promise.resolve(null),
    order.user_id && !order.is_guest
      ? prisma.users.findUnique({
          where: { id: BigInt(Number(order.user_id)) },
          select: {
            id: true,
            f_name: true,
            l_name: true,
            cm_firebase_token: true,
            current_language_key: true,
            is_notification_on: true,
          },
        })
      : Promise.resolve(null),
    order.user_id && order.is_guest
      ? prisma.guests.findUnique({
          where: { id: BigInt(Number(order.user_id)) },
          select: { id: true, fcm_token: true },
        })
      : Promise.resolve(null),
    order.delivery_man_id
      ? prisma.delivery_men.findUnique({
          where: { id: BigInt(Number(order.delivery_man_id)) },
          select: {
            id: true,
            f_name: true,
            l_name: true,
            fcm_token: true,
            is_notification_on: true,
          },
        })
      : Promise.resolve(null),
  ]);

  return { restaurant, vendor, customer, guest, deliveryMan };
}

/** Customer copy for handover on delivery orders matches “picked up / on the way”. */
function customerMessageStatus(order: orders): string {
  if (order.order_status === 'delivered' && order.delivery_man_id) {
    return 'delivery_boy_delivered';
  }
  if (order.order_type === 'delivery' && order.order_status === 'handover') {
    return 'picked_up';
  }
  return order.order_status;
}

/** Avoid duplicate “on the way” push when handover already notified the customer. */
function shouldNotifyCustomerOrderStatus(order: orders): boolean {
  if (order.order_status === 'picked_up' && order.handover != null) {
    return false;
  }
  return true;
}

async function pushVendorFcmDevices(
  pushAllowed: boolean,
  restaurantId: number | null,
  targets: VendorPushTargets,
  data: FcmPushData
): Promise<void> {
  if (!pushAllowed) return;

  const tokens = uniqueDeviceTokens(targets);
  if (tokens.length === 0) {
    if (restaurantId != null) {
      try {
        await sendFcmToTopic(`restaurant_panel_${restaurantId}_message`, data);
      } catch (e) {
        console.error('[notify] FCM restaurant panel topic send failed', e);
      }
    }
    return;
  }

  await Promise.all(tokens.map((token) => pushToDeviceIfEnabled(true, token, data)));
}

async function notifyCustomerOrderStatus(
  order: orders,
  ctx: Awaited<ReturnType<typeof loadOrderContext>>,
  description: string
): Promise<void> {
  if (order.user_id == null) return;

  const userId = Number(order.user_id);
  if (!Number.isFinite(userId)) return;

  const token = order.is_guest ? ctx.guest?.fcm_token : ctx.customer?.cm_firebase_token;
  const recipientOn = order.is_guest ? true : ctx.customer?.is_notification_on;

  if (!order.is_guest && !ctx.customer) {
    console.warn(`[notify] customer push skipped order=${order.id} reason=user_not_found`);
    return;
  }

  const data: FcmPushData = {
    title: ORDER_PUSH_TITLE,
    description,
    order_id: order.id.toString(),
    image: '',
    type: 'order_status',
    order_status: order.order_status,
    order_type: order.order_type,
  };

  try {
    await persistUserNotification({ user_id: userId }, data);
  } catch (e) {
    console.error('[notify] failed to save customer user_notifications', e);
  }

  const enabled = await isPushNotificationEnabled('customer', 'customer_order_notification');
  if (!enabled) {
    console.warn(`[notify] customer push skipped order=${order.id} reason=settings_off`);
    return;
  }
  if (!isRecipientPushOn(recipientOn)) {
    console.warn(`[notify] customer push skipped order=${order.id} reason=user_toggle_off`);
    return;
  }
  if (!token?.trim()) {
    console.warn(
      `[notify] customer push skipped order=${order.id} reason=no_fcm_token — app must call PUT /api/consumer/update-firebase-token`
    );
    return;
  }

  await pushToDeviceIfEnabled(true, token, data);
}

async function notifyVendor(
  vendorId: number,
  restaurantId: number | null,
  targets: VendorPushTargets,
  data: FcmPushData,
  settingKey = 'restaurant_order_notification',
  recipientPushOn = true
): Promise<void> {
  try {
    await persistUserNotification({ vendor_id: vendorId }, data);
  } catch (e) {
    console.error('[notify] failed to save vendor user_notifications', e);
  }

  const enabled =
    restaurantId != null
      ? await isVendorPushEnabled(restaurantId, settingKey)
      : await isPushNotificationEnabled('restaurant', settingKey);

  if (!enabled) {
    console.warn(
      `[notify] vendor push skipped (notification settings off): vendor=${vendorId} key=${settingKey}`
    );
  } else if (uniqueDeviceTokens(targets).length === 0 && restaurantId == null) {
    console.warn(
      `[notify] vendor push skipped (no device token): vendor=${vendorId} — register via PUT /api/vendor/fcm-token`
    );
  }

  await pushVendorFcmDevices(
    enabled && isRecipientPushOn(recipientPushOn),
    restaurantId,
    targets,
    data
  );
}

async function notifyDeliveryMan(
  dmId: number,
  fcmToken: string | null | undefined,
  data: FcmPushData,
  recipientPushOn = true
): Promise<void> {
  try {
    await persistUserNotification({ delivery_man_id: dmId }, data);
  } catch (e) {
    console.error('[notify] failed to save delivery_man user_notifications', e);
  }

  const enabled = await isPushNotificationEnabled('deliveryman', 'deliveryman_order_notification');
  await pushToDeviceIfEnabled(
    enabled && isRecipientPushOn(recipientPushOn),
    fcmToken,
    data
  );
}

async function persistOrderRequestForZoneDrivers(order: orders, data: FcmPushData): Promise<void> {
  if (order.zone_id == null) return;

  const zoneId = Number(order.zone_id);
  if (!Number.isFinite(zoneId)) return;

  const vehicleId =
    order.vehicle_id != null && Number.isFinite(Number(order.vehicle_id))
      ? Number(order.vehicle_id)
      : null;

  const drivers = await prisma.delivery_men.findMany({
    where: {
      zone_id: zoneId,
      application_status: 'approved',
      status: true,
      ...(vehicleId != null ? { vehicle_id: vehicleId } : {}),
    },
    select: { id: true, fcm_token: true, is_notification_on: true },
  });

  await Promise.all(
    drivers.map(async (dm) => {
      await notifyDeliveryMan(
        Number(dm.id),
        dm.fcm_token,
        data,
        dm.is_notification_on
      );
    })
  );

  const enabled = await isPushNotificationEnabled('deliveryman', 'deliveryman_order_notification');
  if (enabled) {
    const topics = await getOrderRequestBroadcastTopics(order);
    await Promise.all(
      topics.map((topic) =>
        sendFcmToTopic(topic, data).catch((e) => {
          console.error('[notify] FCM topic send failed', e);
        })
      )
    );
  }
}

/**
 * Mirrors legacy `Helpers::send_order_notification` — persists every push to `user_notifications`
 * and sends FCM when notification settings + device tokens allow.
 */
export async function sendOrderNotification(orderInput: orders | bigint): Promise<void> {
  const order =
    typeof orderInput === 'bigint'
      ? await prisma.orders.findUnique({ where: { id: orderInput } })
      : orderInput;
  if (!order) return;

  const ctx = await loadOrderContext(order);
  const orderId = order.id.toString();

  const notifyStatus = customerMessageStatus(order);

  const userName = ctx.customer
    ? `${ctx.customer.f_name ?? ''} ${ctx.customer.l_name ?? ''}`.trim()
    : '';

  const description = await buildOrderStatusDescription({
    status: notifyStatus,
    lang: ctx.customer?.current_language_key,
    user_name: userName || undefined,
    restaurant_name: ctx.restaurant?.name ?? undefined,
    order_id: orderId,
  });

  if (shouldNotifyCustomerOrderStatus(order)) {
    await notifyCustomerOrderStatus(order, ctx, description);
  }

  const vendorId = ctx.restaurant?.vendor_id != null ? Number(ctx.restaurant.vendor_id) : null;
  const restaurantId = ctx.restaurant?.id != null ? Number(ctx.restaurant.id) : null;
  const vendorTargets: VendorPushTargets = {
    firebase_token: ctx.vendor?.firebase_token,
    fcm_token_web: ctx.vendor?.fcm_token_web,
  };

  if (vendorId != null && order.order_status === 'picked_up') {
    const vendorData: FcmPushData = {
      title: ORDER_PUSH_TITLE,
      description,
      order_id: orderId,
      image: '',
      type: 'order_status',
      order_status: order.order_status,
    };
    await notifyVendor(
      vendorId,
      restaurantId,
      vendorTargets,
      vendorData,
      'restaurant_order_notification',
      ctx.vendor?.is_notification_on
    );
  }

  if (
    vendorId != null &&
    order.delivery_man_id != null &&
    order.order_status === 'accepted'
  ) {
    const dmName = ctx.deliveryMan
      ? `${ctx.deliveryMan.f_name ?? ''} ${ctx.deliveryMan.l_name ?? ''}`.trim()
      : '';
    const vendorDescription = dmName
      ? `${dmName} accepted the delivery request — Order ID: ${orderId}`
      : `A delivery partner accepted the order request — Order ID: ${orderId}`;
    const vendorData: FcmPushData = {
      title: ORDER_PUSH_TITLE,
      description: vendorDescription,
      order_id: orderId,
      image: '',
      type: 'order_status',
      order_status: order.order_status,
    };
    await notifyVendor(
      vendorId,
      restaurantId,
      vendorTargets,
      vendorData,
      'restaurant_order_notification',
      ctx.vendor?.is_notification_on
    );
  }

  if (
    passesScheduleWindow(order, 30) &&
    passesNotDigitalPending(order) &&
    (await shouldEmitDriverOrderRequest(order))
  ) {
    const requestData: FcmPushData = {
      title: ORDER_PUSH_TITLE,
      description: `New delivery request — Order ID: ${orderId}`,
      order_id: orderId,
      image: '',
      type: 'order_request',
      order_type: order.order_type,
    };
    await persistOrderRequestForZoneDrivers(order, requestData);
  }

  if (
    ctx.deliveryMan &&
    ['processing', 'handover'].includes(order.order_status)
  ) {
    const dmDescription =
      order.order_status === 'processing'
        ? 'Proceed for cooking / pickup when ready'
        : 'Order is ready for delivery';
    const dmData: FcmPushData = {
      title: ORDER_PUSH_TITLE,
      description: dmDescription,
      order_id: orderId,
      image: '',
      type: 'order_status',
      order_status: order.order_status,
    };
    await notifyDeliveryMan(
      Number(ctx.deliveryMan.id),
      ctx.deliveryMan.fcm_token,
      dmData,
      ctx.deliveryMan.is_notification_on
    );
  }
}

/** Vendor new-order row (place order) — kept for explicit new_order type in inbox. */
export async function persistAndPushVendorNewOrder(input: {
  order_id: string;
  vendor_id: number;
  restaurant_id: number;
  order_type: string;
  vendorTokens?: VendorPushTargets;
  recipientPushOn?: boolean;
}): Promise<void> {
  const data: FcmPushData = {
    title: 'New order',
    description: `New order received — Order ID: ${input.order_id}`,
    order_id: input.order_id,
    image: '',
    type: 'new_order',
    order_type: input.order_type,
  };

  await notifyVendor(
    input.vendor_id,
    input.restaurant_id,
    input.vendorTokens ?? {},
    data,
    'restaurant_order_notification',
    input.recipientPushOn ?? true
  );
}
