import prisma from '../../config/database';
import { sendFcmToDevice, sendFcmToTopic } from '../notifications/fcm';
import { toNum } from './ids';
import { loadUserInfoById } from './userInfo';

type MessagePayload = Record<string, unknown>;

export async function sendChatPushToReceiver(params: {
  receiverType: string;
  receiverUserInfoId: number;
  conversationId: number;
  messagePayload: MessagePayload;
  senderType: string;
}) {
  const { receiverType, receiverUserInfoId, conversationId, messagePayload, senderType } =
    params;

  if (receiverType === 'admin' || receiverUserInfoId === 0) {
    await sendFcmToTopic('admin_message', {
      title: 'Message',
      description: 'You have a new message',
      order_id: '',
      image: '',
      type: 'message',
    });
    return;
  }

  const receiverInfo = await loadUserInfoById(receiverUserInfoId);
  if (!receiverInfo) return;

  const vendorId = toNum(receiverInfo.vendor_id);
  const dmId = toNum(receiverInfo.deliveryman_id);
  const customerUserId = toNum(receiverInfo.user_id);

  let tokens: string[] = [];

  if (customerUserId != null) {
    const user = await prisma.users.findUnique({
      where: { id: BigInt(customerUserId) },
      select: { cm_firebase_token: true },
    });
    if (user?.cm_firebase_token) tokens.push(user.cm_firebase_token);
  } else if (vendorId != null) {
    const vendor = await prisma.vendors.findUnique({
      where: { id: BigInt(vendorId) },
      select: { firebase_token: true, fcm_token_web: true },
    });
    if (vendor?.firebase_token) tokens.push(vendor.firebase_token);
    if (vendor?.fcm_token_web) tokens.push(vendor.fcm_token_web);
  } else if (dmId != null) {
    const dm = await prisma.delivery_men.findUnique({
      where: { id: BigInt(dmId) },
      select: { fcm_token: true },
    });
    if (dm?.fcm_token) tokens.push(dm.fcm_token);
  }

  tokens = [...new Set(tokens.filter(Boolean))];

  const data = {
    title: 'Message',
    description: 'You have a new message',
    order_id: '',
    image: '',
    type: 'message',
    conversation_id: String(conversationId),
    sender_type: senderType,
    message: JSON.stringify(messagePayload),
  };

  for (const token of tokens) {
    await sendFcmToDeviceWithChatExtras(token, data);
  }

  if (vendorId != null && senderType === 'delivery_man') {
    const restaurant = await prisma.restaurants.findFirst({
      where: { vendor_id: vendorId },
      select: { id: true },
    });
    if (restaurant) {
      await sendFcmToTopic(`restaurant_panel_${Number(restaurant.id)}_message`, {
        title: data.title,
        description: data.description,
        order_id: '',
        image: '',
        type: 'message',
      });
    }
  }
}

async function sendFcmToDeviceWithChatExtras(
  token: string,
  data: {
    title: string;
    description: string;
    order_id: string;
    image: string;
    type: string;
    conversation_id: string;
    sender_type: string;
    message: string;
  }
): Promise<void> {
  if (!token?.trim()) return;

  const serverKey = process.env.FCM_SERVER_KEY;
  if (serverKey) {
    await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        Authorization: `key=${serverKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token.trim(),
        priority: 'high',
        data: {
          title: data.title,
          body: data.description,
          order_id: data.order_id,
          type: data.type,
          image: data.image,
          conversation_id: data.conversation_id,
          sender_type: data.sender_type,
          message: data.message,
          sound: 'notification.wav',
        },
        notification: {
          title: data.title,
          body: data.description,
          sound: 'notification.wav',
        },
      }),
    });
    return;
  }

  await sendFcmToDevice(token, {
    title: data.title,
    description: data.description,
    order_id: data.order_id,
    image: data.image,
    type: data.type,
  });
}
