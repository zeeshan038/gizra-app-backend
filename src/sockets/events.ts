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
  ChatMessagePayload,
  ConversationSubscribePayload,
  ConversationSubscribeAck,
} from '../types/sockets/realtime';
