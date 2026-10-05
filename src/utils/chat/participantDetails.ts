import prisma from '../../config/database';
import type { conversations, user_infos } from '@prisma/client';
import { formatMessageRow } from './format';
import {
  findConversationBetween,
  hydrateConversation,
  markConversationReadForViewer,
} from './conversationQuery';
import { paginationFromPage } from './ids';
import {
  getOrCreateCustomerUserInfo,
  getOrCreateDeliveryManUserInfo,
  getOrCreateVendorUserInfo,
  loadUserInfoById,
  userInfoId,
} from './userInfo';

export type ParticipantDetailsInput = {
  viewerUserInfoId: number;
  conversationId?: number;
  adminId?: number;
  vendorId?: number;
  deliveryManId?: number;
  customerUserId?: number;
  limit: number;
  page: number;
  countActiveOrders: (
    conv: conversations,
    sender: user_infos | null,
    receiver: user_infos | null
  ) => Promise<number>;
};

export async function getParticipantMessageDetails(input: ParticipantDetailsInput) {
  let row: conversations | null = null;

  if (input.conversationId) {
    row = await prisma.conversations.findUnique({
      where: { id: BigInt(input.conversationId) },
    });
    if (row) {
      const senderId = Number(row.sender_id);
      const receiverId = Number(row.receiver_id);
      const ok =
        senderId === input.viewerUserInfoId || receiverId === input.viewerUserInfoId;
      if (!ok) return { forbidden: true as const };
    }
  } else if (input.adminId != null) {
    row = await findConversationBetween(input.viewerUserInfoId, 0);
  } else if (input.vendorId != null) {
    const vendorInfo = await getOrCreateVendorUserInfo(input.vendorId);
    row = await findConversationBetween(input.viewerUserInfoId, userInfoId(vendorInfo));
  } else if (input.deliveryManId != null) {
    const dmInfo = await getOrCreateDeliveryManUserInfo(input.deliveryManId);
    row = await findConversationBetween(input.viewerUserInfoId, userInfoId(dmInfo));
  } else if (input.customerUserId != null) {
    const customerInfo = await getOrCreateCustomerUserInfo(input.customerUserId);
    row = await findConversationBetween(input.viewerUserInfoId, userInfoId(customerInfo));
  }

  if (!row) {
    return {
      total_size: 0,
      limit: input.limit,
      offset: input.page,
      status: false,
      messages: [],
      conversation: null,
    };
  }

  await markConversationReadForViewer(row, input.viewerUserInfoId);

  const { take, skip } = paginationFromPage(input.limit, input.page);
  const [messages, total, conversation] = await Promise.all([
    prisma.messages.findMany({
      where: { conversation_id: Number(row.id) },
      orderBy: { created_at: 'desc' },
      take,
      skip,
    }),
    prisma.messages.count({ where: { conversation_id: Number(row.id) } }),
    hydrateConversation(row),
  ]);

  const sender = await loadUserInfoById(Number(row.sender_id));
  const receiver = await loadUserInfoById(Number(row.receiver_id));
  const orderCount = await input.countActiveOrders(row, sender, receiver);

  return {
    total_size: total,
    limit: take,
    offset: input.page,
    status: orderCount > 0,
    messages: messages.map(formatMessageRow),
    conversation,
  };
}
