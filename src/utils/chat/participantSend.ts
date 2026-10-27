import prisma from '../../config/database';
import type { conversations, user_infos } from '@prisma/client';
import { emitChatMessageRealtime } from '../../sockets/chatRealtime';
import { formatMessageRow } from './format';
import {
  findConversationBetween,
  hydrateConversation,
} from './conversationQuery';
import { paginationFromPage, toNum } from './ids';
import { sendChatPushToReceiver } from './chatPush';
import { loadUserInfoById } from './userInfo';
import { resolveReceiverUserInfoId } from './resolveReceiver';
import { dbSenderTypeForRole, fcmSenderTypeForRole, type ChatOwnerRole } from './types';

export type ParticipantSendInput = {
  ownerRole: ChatOwnerRole;
  senderUserInfoId: number;
  conversationId?: number;
  receiverType?: string;
  receiverEntityId?: number;
  message?: string | null;
  fileJson?: string | null;
  limit: number;
  page: number;
  countActiveOrders: (
    conv: conversations,
    sender: user_infos | null,
    receiver: user_infos | null
  ) => Promise<number>;
};

export async function participantSendMessage(input: ParticipantSendInput) {
  const now = new Date();
  let conversation: conversations | null = null;
  let receiverUserInfoId: number | null = null;
  let receiverType = input.receiverType ?? null;

  if (input.conversationId) {
    conversation = await prisma.conversations.findUnique({
      where: { id: BigInt(input.conversationId) },
    });
    if (!conversation) throw new Error('conversation_not_found');

    const senderId = toNum(conversation.sender_id);
    const receiverId = Number(conversation.receiver_id);
    if (senderId !== input.senderUserInfoId && receiverId !== input.senderUserInfoId) {
      throw new Error('forbidden');
    }
    receiverUserInfoId =
      senderId === input.senderUserInfoId ? receiverId : (senderId as number);
    receiverType =
      senderId === input.senderUserInfoId
        ? conversation.receiver_type
        : conversation.sender_type;
  } else {
    if (!receiverType) throw new Error('receiver_type_required');
    receiverUserInfoId = await resolveReceiverUserInfoId(receiverType, input.receiverEntityId);
    conversation = await findConversationBetween(input.senderUserInfoId, receiverUserInfoId);
  }

  if (!conversation) {
    conversation = await prisma.conversations.create({
      data: {
        sender_id: input.senderUserInfoId,
        sender_type: dbSenderTypeForRole(input.ownerRole),
        receiver_id: receiverUserInfoId!,
        receiver_type: receiverType!,
        unread_message_count: BigInt(0),
        last_message_time: now,
        created_at: now,
        updated_at: now,
      },
    });
  }

  const messageRow = await prisma.messages.create({
    data: {
      conversation_id: Number(conversation.id),
      sender_id: input.senderUserInfoId,
      message: input.message ?? null,
      file: input.fileJson ?? null,
      is_seen: false,
      created_at: now,
      updated_at: now,
    },
  });

  const unread = Number(conversation.unread_message_count) + 1;
  await prisma.conversations.update({
    where: { id: conversation.id },
    data: {
      unread_message_count: BigInt(unread),
      last_message_id: Number(messageRow.id),
      last_message_time: now,
      updated_at: now,
    },
  });

  const formattedMessage = formatMessageRow(messageRow);
  const resolvedReceiverType = receiverType ?? conversation.receiver_type;
  const resolvedReceiverUserInfoId =
    receiverUserInfoId ?? Number(conversation.receiver_id);

  try {
    await sendChatPushToReceiver({
      receiverType: resolvedReceiverType,
      receiverUserInfoId: resolvedReceiverUserInfoId,
      conversationId: Number(conversation.id),
      messagePayload: formattedMessage,
      senderType: fcmSenderTypeForRole(input.ownerRole),
    });
  } catch (e) {
    console.error('[chat] push failed', e);
  }

  emitChatMessageRealtime({
    conversation_id: String(conversation.id),
    message: formattedMessage,
    sender_type: dbSenderTypeForRole(input.ownerRole),
    receiver_type: resolvedReceiverType,
    receiver_user_info_id: resolvedReceiverUserInfoId,
  });

  const { take, skip } = paginationFromPage(input.limit, input.page);
  const freshConv = await prisma.conversations.findUnique({ where: { id: conversation.id } });
  const [messages, total, convHydrated] = await Promise.all([
    prisma.messages.findMany({
      where: { conversation_id: Number(conversation.id) },
      orderBy: { created_at: 'desc' },
      take,
      skip,
    }),
    prisma.messages.count({ where: { conversation_id: Number(conversation.id) } }),
    hydrateConversation(freshConv!),
  ]);

  const sender = await loadUserInfoById(toNum(freshConv!.sender_id)!);
  const receiver = await loadUserInfoById(Number(freshConv!.receiver_id));
  const orderCount = await input.countActiveOrders(freshConv!, sender, receiver);

  return {
    total_size: total,
    limit: take,
    offset: input.page,
    status: orderCount > 0,
    message: 'successfully sent!',
    messages: messages.map(formatMessageRow),
    conversation: convHydrated,
  };
}
