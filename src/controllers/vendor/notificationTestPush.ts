import { Request, Response } from 'express';
import prisma from '../../config/database';
import { isFirebaseReady } from '../../config/firebase';
import { sendFcmToDevice, sendFcmToTopic } from '../../utils/notifications/fcm';
import {
  isVendorPushEnabled,
  vendorPushBlockReason,
} from '../../utils/notifications/notificationSettings';
import { isRecipientPushOn } from '../../utils/notifications/pushNotificationPreference';
import { getVendorFcmSubscribeTopics, vendorRestaurantMessageTopic } from '../../utils/vendor/pushTopics';
import { getVendorContext } from '../../utils/vendor/context';

function maskToken(token: string | null | undefined): string | null {
  if (!token?.trim()) return null;
  const t = token.trim();
  if (t.length <= 12) return '***';
  return `${t.slice(0, 8)}…${t.slice(-6)} (${t.length} chars)`;
}

/**
 * @Description Send a test new-order FCM to this vendor (device + restaurant topic) and return diagnostics.
 * @Route POST /api/vendor/notifications/test-push
 * @Access Private (Vendor)
 */
export const testVendorPush = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context not found for vendor' });
  }

  const vendor = await prisma.vendors.findUnique({
    where: { id: BigInt(ctx.vendorId) },
    select: {
      firebase_token: true,
      fcm_token_web: true,
      is_notification_on: true,
    },
  });
  if (!vendor) {
    return res.status(404).json({ status: false, msg: 'Vendor not found' });
  }

  const pushEnabled = await isVendorPushEnabled(ctx.restaurantId, 'restaurant_order_notification');
  const blockReason = pushEnabled
    ? null
    : await vendorPushBlockReason(ctx.restaurantId, 'restaurant_order_notification');
  const recipientOn = isRecipientPushOn(vendor.is_notification_on);
  const fcmTopics = getVendorFcmSubscribeTopics(ctx.restaurantId);
  const topic = vendorRestaurantMessageTopic(ctx.restaurantId);

  const data = {
    title: 'Test order',
    description: 'Gizra test — if you see this, POS push is working',
    order_id: '0',
    restaurant_id: ctx.restaurantId,
    image: '',
    type: 'new_order',
    order_type: 'delivery',
  };

  const delivery: { device: string; topic: string } = { device: 'skipped', topic: 'skipped' };

  if (!pushEnabled || !recipientOn) {
    return res.status(200).json({
      status: true,
      msg: 'Push blocked by settings — fix admin/restaurant notification toggles',
      data: {
        firebase_ready: isFirebaseReady,
        push_enabled: pushEnabled,
        recipient_notification_on: recipientOn,
        block_reason: blockReason,
        firebase_token: maskToken(vendor.firebase_token),
        fcm_token_web: maskToken(vendor.fcm_token_web),
        fcm_topics: fcmTopics,
        delivery,
      },
    });
  }

  const token = vendor.firebase_token?.trim() || vendor.fcm_token_web?.trim();
  try {
    if (token) {
      await sendFcmToDevice(token, data);
      delivery.device = 'sent';
    } else {
      delivery.device = 'no_token — call PUT /api/vendor/fcm-token';
    }
    await sendFcmToTopic(topic, data);
    delivery.topic = `sent:${topic}`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'FCM send failed';
    return res.status(503).json({
      status: false,
      msg,
      data: {
        firebase_ready: isFirebaseReady,
        push_enabled: pushEnabled,
        block_reason: blockReason,
        firebase_token: maskToken(vendor.firebase_token),
        fcm_topics: fcmTopics,
        delivery,
      },
    });
  }

  return res.status(200).json({
    status: true,
    msg: 'Test push sent — check device notification tray',
    data: {
      firebase_ready: isFirebaseReady,
      push_enabled: pushEnabled,
      recipient_notification_on: recipientOn,
      block_reason: blockReason,
      firebase_token: maskToken(vendor.firebase_token),
      fcm_token_web: maskToken(vendor.fcm_token_web),
      fcm_topics: fcmTopics,
      delivery,
    },
  });
};
