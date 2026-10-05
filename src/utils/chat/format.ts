import type { conversations, messages, user_infos } from '@prisma/client';
import { publicMediaUrl } from '../mediaStorage';
import { toNum } from './ids';

export function formatUserInfoRow(row: user_infos | null | undefined) {
  if (!row) return null;
  return {
    id: Number(row.id),
    f_name: row.f_name,
    l_name: row.l_name,
    phone: row.phone,
    email: row.email,
    image: row.image ? publicMediaUrl(row.image) ?? row.image : row.image,
    admin_id: toNum(row.admin_id),
    user_id: toNum(row.user_id),
    vendor_id: toNum(row.vendor_id),
    deliveryman_id: toNum(row.deliveryman_id),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function formatMessageRow(row: messages) {
  return {
    id: Number(row.id),
    conversation_id: toNum(row.conversation_id),
    sender_id: toNum(row.sender_id),
    message: row.message,
    file: row.file,
    is_seen: row.is_seen,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function formatConversationRow(
  row: conversations,
  sender: user_infos | null,
  receiver: user_infos | null,
  lastMessage: messages | null
) {
  return {
    id: Number(row.id),
    sender_id: toNum(row.sender_id),
    receiver_id: Number(row.receiver_id),
    sender_type: row.sender_type,
    receiver_type: row.receiver_type,
    last_message_id: toNum(row.last_message_id),
    last_message_time: row.last_message_time,
    unread_message_count: Number(row.unread_message_count),
    created_at: row.created_at,
    updated_at: row.updated_at,
    sender: formatUserInfoRow(sender),
    receiver: formatUserInfoRow(receiver),
    last_message: lastMessage ? formatMessageRow(lastMessage) : null,
  };
}
