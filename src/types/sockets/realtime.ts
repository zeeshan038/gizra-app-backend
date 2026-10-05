/** Server → client event names. */
export const SocketEvents = {
  SESSION_READY: 'session_ready',
  NEW_ORDER: 'new_order',
  ORDER_REQUEST: 'order_request',
  ORDER_STATUS_CHANGED: 'order_status_changed',
  CHAT_MESSAGE: 'chat_message',
} as const;

export type SocketServerEventName = (typeof SocketEvents)[keyof typeof SocketEvents];

/** Client → server event names. */
export const ClientEvents = {
  WATCH_ORDER: 'watch_order',
  UNWATCH_ORDER: 'unwatch_order',
  WATCH_CONVERSATION: 'watch_conversation',
  UNWATCH_CONVERSATION: 'unwatch_conversation',
} as const;

export type SocketClientEventName = (typeof ClientEvents)[keyof typeof ClientEvents];

export type OrderNewPayload = {
  order_id: string;
  restaurant_id: number;
  order_amount: number;
  order_type: string;
  payment_method: string | null;
};

/** Driver pool — unassigned delivery job (refetch GET /delivery-man/orders/latest). */
export type OrderRequestPayload = {
  order_id: string;
  restaurant_id: number;
  order_amount: number;
  order_type: string;
  payment_method: string | null;
  order_status: string;
  zone_id: number | null;
  vehicle_id: number | null;
};

export type OrderUpdatedPayload = {
  order_id: string;
  restaurant_id: number;
  user_id: string | null;
  delivery_man_id: string | null;
  order_status: string;
  order_amount: number;
  order_type: string;
  payment_method: string | null;
  updated_at: string;
};

export type SessionReadyPayload = {
  role: 'vendor' | 'customer' | 'delivery_man';
  restaurant_id?: number;
  user_id?: number;
  delivery_man_id?: number;
};

/** @deprecated use SessionReadyPayload */
export type SocketConnectedPayload = SessionReadyPayload;

export type OrderSubscribePayload = {
  order_id: string | number;
};

export type OrderSubscribeAck =
  | { ok: true; order_id: string }
  | { ok: false; msg: string };

export type ChatMessagePayload = {
  conversation_id: string;
  message: Record<string, unknown>;
  sender_type: string;
  receiver_type: string;
  receiver_user_info_id: number;
};

export type ConversationSubscribePayload = {
  conversation_id: string | number;
};

export type ConversationSubscribeAck =
  | { ok: true; conversation_id: string }
  | { ok: false; msg: string };
