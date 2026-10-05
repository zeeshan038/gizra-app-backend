import type { Server } from 'socket.io';
import prisma from '../config/database';
import { SocketEvents } from '../types/sockets/realtime';
import type {
  ChatMessagePayload,
  OrderNewPayload,
  OrderRequestPayload,
  OrderUpdatedPayload,
} from '../types/sockets/realtime';
import {
  conversationRoom,
  deliveryManRoom,
  fcmTopicRoom,
  orderRoom,
  restaurantRoom,
  userRoom,
  vendorRoom,
} from './rooms';

let io: Server | null = null;

export function bindSocketServer(server: Server): void {
  io = server;
}

export function getSocketServer(): Server | null {
  return io;
}

export function publishOrderNew(payload: OrderNewPayload): void {
  if (!io) return;
  const room = restaurantRoom(payload.restaurant_id);
  io.to(room).emit(SocketEvents.NEW_ORDER, payload);
}

export function publishOrderRequest(topics: string[], payload: OrderRequestPayload): void {
  if (!io || topics.length === 0) return;
  for (const topic of topics) {
    io.to(fcmTopicRoom(topic)).emit(SocketEvents.ORDER_REQUEST, payload);
  }
}

export function publishOrderUpdatedToTopics(
  topics: string[],
  payload: OrderUpdatedPayload
): void {
  if (!io || topics.length === 0) return;
  for (const topic of topics) {
    io.to(fcmTopicRoom(topic)).emit(SocketEvents.ORDER_STATUS_CHANGED, payload);
  }
}

export function publishOrderUpdated(payload: OrderUpdatedPayload): void {
  if (!io) return;

  io.to(restaurantRoom(payload.restaurant_id)).emit(SocketEvents.ORDER_STATUS_CHANGED, payload);
  io.to(orderRoom(payload.order_id)).emit(SocketEvents.ORDER_STATUS_CHANGED, payload);

  if (payload.user_id) {
    io.to(userRoom(payload.user_id)).emit(SocketEvents.ORDER_STATUS_CHANGED, payload);
  }
  if (payload.delivery_man_id) {
    io.to(deliveryManRoom(payload.delivery_man_id)).emit(SocketEvents.ORDER_STATUS_CHANGED, payload);
  }
}

/** Live chat — REST send is source of truth; socket updates open threads and inbox badges. */
export function publishChatMessage(payload: ChatMessagePayload): void {
  if (!io) return;

  io.to(conversationRoom(payload.conversation_id)).emit(SocketEvents.CHAT_MESSAGE, payload);
  void emitChatMessageToReceiverInbox(payload);
}

async function emitChatMessageToReceiverInbox(payload: ChatMessagePayload): Promise<void> {
  if (!io) return;

  const receiverId = payload.receiver_user_info_id;
  const info = await prisma.user_infos.findUnique({
    where: { id: BigInt(receiverId) },
    select: { user_id: true, vendor_id: true, deliveryman_id: true },
  });
  if (!info) return;

  if (payload.receiver_type === 'customer' && info.user_id != null) {
    io.to(userRoom(Number(info.user_id))).emit(SocketEvents.CHAT_MESSAGE, payload);
  } else if (payload.receiver_type === 'vendor' && info.vendor_id != null) {
    io.to(vendorRoom(Number(info.vendor_id))).emit(SocketEvents.CHAT_MESSAGE, payload);
  } else if (payload.receiver_type === 'delivery_man' && info.deliveryman_id != null) {
    io.to(deliveryManRoom(Number(info.deliveryman_id))).emit(SocketEvents.CHAT_MESSAGE, payload);
  }
}
