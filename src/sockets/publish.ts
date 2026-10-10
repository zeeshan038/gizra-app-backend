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

export function publishOrderNew(payload: OrderNewPayload, vendorId?: number): void {
  if (!io) {
    console.warn('[socket] publishOrderNew skipped — Socket.IO not initialized');
    return;
  }
  const restaurant = restaurantRoom(payload.restaurant_id);
  // Union of rooms: a socket in both still receives the event once.
  const target = vendorId != null ? io.to(restaurant).to(vendorRoom(vendorId)) : io.to(restaurant);
  target.emit(SocketEvents.NEW_ORDER, payload);
  console.log(
    `[socket] new_order order=${payload.order_id} room=${restaurant} vendor=${vendorId ?? '-'}`
  );
}

export function publishOrderRequest(topics: string[], payload: OrderRequestPayload): void {
  if (!io || topics.length === 0) return;
  for (const topic of topics) {
    io.to(fcmTopicRoom(topic)).emit(SocketEvents.ORDER_REQUEST, payload);
  }
  console.log(
    `[socket] order_request order=${payload.order_id} topics=${topics.join(',')}`
  );
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

  console.log(
    `[socket] order_status_changed order=${payload.order_id} status=${payload.order_status} user=${payload.user_id ?? '-'} step=${payload.tracking_step}`
  );
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
