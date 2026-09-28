/** Re-export socket wire contract from `src/types/sockets` (shared with clients/docs). */
export {
  SocketEvents,
  ClientEvents,
} from '../types/sockets/realtime';

export type {
  SocketServerEventName,
  SocketClientEventName,
  OrderNewPayload,
  OrderUpdatedPayload,
  SessionReadyPayload,
  SocketConnectedPayload,
  OrderSubscribePayload,
  OrderSubscribeAck,
} from '../types/sockets/realtime';
