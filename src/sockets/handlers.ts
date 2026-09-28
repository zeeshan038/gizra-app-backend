import type { Server } from 'socket.io';
import { authenticateSocketToken, canAccessOrder } from './auth';
import { ClientEvents, SocketEvents } from '../types/sockets/realtime';
import type { SocketActor } from '../types/sockets/auth';
import type {
  OrderSubscribeAck,
  OrderSubscribePayload,
  SessionReadyPayload,
} from '../types/sockets/realtime';
import { deliveryManRoom, orderRoom, restaurantRoom, userRoom } from './rooms';

function joinDefaultRooms(socket: { join: (room: string) => void }, actor: SocketActor): void {
  if (actor.role === 'vendor') {
    socket.join(restaurantRoom(actor.restaurantId));
  } else if (actor.role === 'customer') {
    socket.join(userRoom(actor.userId));
  } else if (actor.role === 'delivery_man') {
    socket.join(deliveryManRoom(actor.deliveryManId));
  }
}

export function registerSocketHandlers(io: Server): void {
  io.use(async (socket, next) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ||
      (socket.handshake.query?.token as string | undefined);

    const actor = await authenticateSocketToken(token ?? '');
    if (!actor) {
      next(new Error('Unauthorized'));
      return;
    }
    (socket.data as { actor?: SocketActor }).actor = actor;
    next();
  });

  io.on('connection', (socket) => {
    const actor = (socket.data as { actor: SocketActor }).actor;
    joinDefaultRooms(socket, actor);

    const sessionReady: SessionReadyPayload = {
      role: actor.role,
      restaurant_id: actor.role === 'vendor' ? actor.restaurantId : undefined,
      user_id: actor.role === 'customer' ? actor.userId : undefined,
      delivery_man_id: actor.role === 'delivery_man' ? actor.deliveryManId : undefined,
    };
    socket.emit(SocketEvents.SESSION_READY, sessionReady);

    socket.on(
      ClientEvents.WATCH_ORDER,
      async (payload: OrderSubscribePayload, ack?: (res: OrderSubscribeAck) => void) => {
      const orderId = Number(payload?.order_id);
      if (!Number.isFinite(orderId) || orderId <= 0) {
        ack?.({ ok: false, msg: 'Invalid order_id' });
        return;
      }
      const allowed = await canAccessOrder(actor, orderId);
      if (!allowed) {
        ack?.({ ok: false, msg: 'Forbidden' });
        return;
      }
      socket.join(orderRoom(orderId));
      ack?.({ ok: true, order_id: String(orderId) });
    }
    );

    socket.on(ClientEvents.UNWATCH_ORDER, (payload: OrderSubscribePayload) => {
      const orderId = Number(payload?.order_id);
      if (Number.isFinite(orderId) && orderId > 0) {
        socket.leave(orderRoom(orderId));
      }
    });
  });
}
