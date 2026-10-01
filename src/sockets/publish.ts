import type { Server } from 'socket.io';
import { SocketEvents } from '../types/sockets/realtime';
import type {
  OrderNewPayload,
  OrderRequestPayload,
  OrderUpdatedPayload,
} from '../types/sockets/realtime';
import { deliveryManRoom, fcmTopicRoom, orderRoom, restaurantRoom, userRoom } from './rooms';

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
