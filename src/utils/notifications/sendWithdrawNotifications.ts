import prisma from '../../config/database';
import { getSocketServer } from '../../sockets/publish';
import { vendorRoom } from '../../sockets/rooms';
import { SocketEvents } from '../../types/sockets/realtime';
import { sendFcmToDevice, sendFcmToTopic, type FcmPushData } from './fcm';
import {
  isPushNotificationEnabled,
  isVendorPushEnabled,
} from './notificationSettings';
import { persistUserNotification } from './persistUserNotification';
import { isRecipientPushOn } from './pushNotificationPreference';

async function pushVendorTokens(
  vendorId: number,
  restaurantId: number | null,
  settingKey: string,
  payload: FcmPushData
): Promise<void> {
  const vendor = await prisma.vendors.findUnique({
    where: { id: BigInt(vendorId) },
    select: {
      firebase_token: true,
      fcm_token_web: true,
      is_notification_on: true,
    },
  });
  if (!vendor || !isRecipientPushOn(vendor.is_notification_on)) return;

  const enabled =
    restaurantId != null
      ? await isVendorPushEnabled(restaurantId, settingKey)
      : await isPushNotificationEnabled('restaurant', settingKey);
  if (!enabled) return;

  const tokens = [...new Set([vendor.firebase_token, vendor.fcm_token_web].filter(Boolean))] as string[];
  await Promise.all(
    tokens.map(async (token) => {
      try {
        await sendFcmToDevice(token, payload);
      } catch (e) {
        console.error('[notify] withdraw vendor FCM failed', e);
      }
    })
  );
}

function publishVendorWithdrawSocket(
  vendorId: number,
  payload: {
    withdraw_id: number;
    amount: number;
    status: 'pending' | 'approved' | 'denied';
    title: string;
    description: string;
  }
): void {
  const io = getSocketServer();
  if (!io) return;
  io.to(vendorRoom(vendorId)).emit(SocketEvents.WITHDRAW_STATUS, payload);
}

/**
 * Restaurant submitted a withdraw request → notify admin (FCM topic + optional mail is separate).
 * Admin panel also polls pending count for in-browser sound.
 */
export async function notifyAdminOfWithdrawRequest(input: {
  vendorId: number;
  amount: number;
  withdrawId?: number;
}): Promise<void> {
  const enabled = await isPushNotificationEnabled('admin', 'withdraw_request');
  const payload: FcmPushData = {
    title: 'Withdraw request',
    description: `A restaurant requested a withdraw of ${input.amount.toFixed(2)}`,
    order_id: input.withdrawId != null ? String(input.withdrawId) : '',
    image: '',
    type: 'withdraw',
  };

  if (enabled) {
    try {
      await sendFcmToTopic('admin_message', payload);
    } catch (e) {
      console.error('[notify] admin withdraw topic failed', e);
    }
  }
}

/**
 * Admin approved or denied → notify restaurant (inbox + FCM + socket for panel sound).
 */
export async function notifyRestaurantOfWithdrawDecision(input: {
  vendorId: number;
  restaurantId: number | null;
  withdrawId: number;
  amount: number;
  approved: 1 | 2;
}): Promise<void> {
  const isApproved = input.approved === 1;
  const settingKey = isApproved ? 'restaurant_withdraw_approve' : 'restaurant_withdraw_rejaction';
  const payload: FcmPushData = {
    title: isApproved ? 'Withdraw approved' : 'Withdraw rejected',
    description: isApproved
      ? 'Withdraw request approved by admin'
      : 'Withdraw request rejected by admin',
    order_id: String(input.withdrawId),
    image: '',
    type: 'withdraw',
  };

  try {
    await persistUserNotification({ vendor_id: input.vendorId }, payload);
  } catch (e) {
    console.error('[notify] persist withdraw decision failed', e);
  }

  await pushVendorTokens(input.vendorId, input.restaurantId, settingKey, payload);

  publishVendorWithdrawSocket(input.vendorId, {
    withdraw_id: input.withdrawId,
    amount: input.amount,
    status: isApproved ? 'approved' : 'denied',
    title: payload.title,
    description: payload.description,
  });
}
