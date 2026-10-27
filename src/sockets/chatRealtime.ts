import type { ChatMessagePayload } from '../types/sockets/realtime';
import { publishChatMessage } from './publish';

export function emitChatMessageRealtime(payload: ChatMessagePayload): void {
  publishChatMessage(payload);
}
