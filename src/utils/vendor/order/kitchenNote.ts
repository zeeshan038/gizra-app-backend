import { orders } from '@prisma/client';
import prisma from '../../../config/database';
import { vendorSendMessage } from '../../chat/sendMessage';
import { getOrCreateVendorUserInfo, userInfoId } from '../../chat/userInfo';
import { sendFcmToDevice, type FcmPushData } from '../../notifications/fcm';
import { persistUserNotification } from '../../notifications/persistUserNotification';

export const KITCHEN_NOTE_PRESETS = [
  'Item out of stock',
  'Running 10 min late',
  'No Cutlery',
  'Item Swapped',
] as const;

export function buildKitchenNoteText(input: {
  note?: string;
  notes?: string[];
}): string {
  const fromNotes = (input.notes ?? [])
    .map((n) => String(n).trim())
    .filter(Boolean);
  if (fromNotes.length) {
    return fromNotes.join(' • ');
  }
  return String(input.note ?? '').trim();
}

async function resolveCustomerPushToken(order: orders): Promise<{
  userId: number | null;
  token: string | null;
  isGuest: boolean;
}> {
  if (order.user_id == null) {
    return { userId: null, token: null, isGuest: Boolean(order.is_guest) };
  }
  const userId = Number(order.user_id);
  if (!Number.isFinite(userId)) {
    return { userId: null, token: null, isGuest: Boolean(order.is_guest) };
  }

  if (order.is_guest) {
    const guest = await prisma.guests.findUnique({
      where: { id: BigInt(userId) },
      select: { fcm_token: true },
    });
    return { userId, token: guest?.fcm_token ?? null, isGuest: true };
  }

  const customer = await prisma.users.findUnique({
    where: { id: BigInt(userId) },
    select: { cm_firebase_token: true, is_notification_on: true },
  });
  if (!customer?.is_notification_on) {
    return { userId, token: null, isGuest: false };
  }
  return { userId, token: customer.cm_firebase_token ?? null, isGuest: false };
}

/**
 * Notify customer about a kitchen note (chat when registered + FCM). No schema change —
 * same approach as legacy Flutter POS (message/send + push).
 */
export async function notifyCustomerKitchenNote(params: {
  order: orders;
  vendorId: number;
  restaurantName: string;
  note: string;
}): Promise<{ chat_sent: boolean; push_sent: boolean }> {
  const { order, vendorId, restaurantName, note } = params;
  let chat_sent = false;
  let push_sent = false;

  const title = 'Kitchen note';
  const description = `${restaurantName}: ${note}`;

  const pushData: FcmPushData = {
    title,
    description,
    order_id: order.id.toString(),
    image: '',
    type: 'kitchen_note',
    order_status: order.order_status ?? undefined,
    order_type: order.order_type ?? undefined,
  };

  const { userId, token, isGuest } = await resolveCustomerPushToken(order);

  if (userId != null && !isGuest) {
    try {
      await persistUserNotification({ user_id: userId }, pushData);
    } catch (e) {
      console.error('[kitchen-note] persist notification failed', e);
    }

    try {
      const sender = await getOrCreateVendorUserInfo(vendorId);
      await vendorSendMessage({
        vendorId,
        senderUserInfoId: userInfoId(sender),
        receiverType: 'customer',
        receiverEntityId: userId,
        message: note,
        limit: 20,
        page: 1,
      });
      chat_sent = true;
    } catch (e) {
      console.error('[kitchen-note] chat send failed', e);
    }
  }

  if (token?.trim()) {
    try {
      await sendFcmToDevice(token, pushData);
      push_sent = true;
    } catch (e) {
      console.error('[kitchen-note] fcm failed', e);
    }
  }

  return { chat_sent, push_sent };
}
