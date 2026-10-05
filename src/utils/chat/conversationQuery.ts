import prisma from '../../config/database';
import type { Prisma, conversations, messages, user_infos } from '@prisma/client';
import { formatConversationRow } from './format';
import { paginationFromPage, toNum } from './ids';
import { loadUserInfoById } from './userInfo';
import type { ChatOwnerRole } from './types';

const ACTIVE_ORDER_STATUSES = [
  'pending',
  'accepted',
  'confirmed',
  'processing',
  'handover',
  'picked_up',
] as const;

export async function findConversationBetween(
  userInfoIdA: number,
  userInfoIdB: number
): Promise<conversations | null> {
  return prisma.conversations.findFirst({
    where: {
      OR: [
        { sender_id: userInfoIdA, receiver_id: userInfoIdB },
        { sender_id: userInfoIdB, receiver_id: userInfoIdA },
      ],
    },
  });
}

async function hydrateConversation(row: conversations) {
  const senderId = toNum(row.sender_id);
  const receiverId = Number(row.receiver_id);
  const [sender, receiver, lastMessage] = await Promise.all([
    senderId != null ? loadUserInfoById(senderId) : Promise.resolve(null),
    loadUserInfoById(receiverId),
    row.last_message_id != null
      ? prisma.messages.findUnique({ where: { id: BigInt(Number(row.last_message_id)) } })
      : Promise.resolve(null),
  ]);
  return formatConversationRow(row, sender, receiver, lastMessage);
}

function typeFilterForOwner(ownerRole: ChatOwnerRole, counterpartyType: string) {
  return {
    OR: [
      { receiver_type: counterpartyType, sender_type: ownerRole },
      { sender_type: counterpartyType, receiver_type: ownerRole },
    ],
  };
}

export async function listConversationsForUserInfo(
  userInfoId: number,
  options: { ownerRole: ChatOwnerRole; type?: string; limit: number; page: number }
) {
  const { take, skip } = paginationFromPage(options.limit, options.page);
  const type = options.type?.trim();

  const where: Prisma.conversationsWhereInput = {
    OR: [{ sender_id: userInfoId }, { receiver_id: userInfoId }],
  };

  if (type) {
    where.AND = [typeFilterForOwner(options.ownerRole, type)];
  }

  const [total, rows] = await Promise.all([
    prisma.conversations.count({ where }),
    prisma.conversations.findMany({
      where,
      orderBy: { last_message_time: 'desc' },
      take,
      skip,
    }),
  ]);

  const conversations = await Promise.all(rows.map((r) => hydrateConversation(r)));
  return {
    type: type ?? null,
    total_size: total,
    limit: take,
    offset: options.page,
    conversations,
  };
}

export async function searchConversationsForUserInfo(
  userInfoId: number,
  name: string,
  options: { ownerRole: ChatOwnerRole; type?: string; limit: number; page: number }
) {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return { total_size: 0, limit: options.limit, offset: options.page, conversations: [] };
  }

  const participantIds = new Set<number>();
  for (const token of tokens) {
    const matches = await prisma.user_infos.findMany({
      where: {
        OR: [
          { f_name: { contains: token, mode: 'insensitive' } },
          { l_name: { contains: token, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
      take: 200,
    });
    for (const m of matches) participantIds.add(Number(m.id));
  }

  const ids = [...participantIds].filter((id) => id !== userInfoId);
  if (ids.length === 0) {
    return { total_size: 0, limit: options.limit, offset: options.page, conversations: [] };
  }

  const { take, skip } = paginationFromPage(options.limit, options.page);
  const type = options.type?.trim();

  const where: Prisma.conversationsWhereInput = {
    OR: [
      { sender_id: userInfoId, receiver_id: { in: ids } },
      { receiver_id: userInfoId, sender_id: { in: ids } },
    ],
  };

  if (type) {
    where.AND = [typeFilterForOwner(options.ownerRole, type)];
  }

  const [total, rows] = await Promise.all([
    prisma.conversations.count({ where }),
    prisma.conversations.findMany({
      where,
      orderBy: { last_message_time: 'desc' },
      take,
      skip,
    }),
  ]);

  const conversations = await Promise.all(rows.map((r) => hydrateConversation(r)));
  return { total_size: total, limit: take, offset: options.page, conversations };
}

export async function countActiveOrdersForCustomerConversation(
  customerUserId: number,
  conv: conversations,
  sender: user_infos | null,
  receiver: user_infos | null
): Promise<number> {
  if (conv.sender_type === 'vendor' && sender?.vendor_id != null) {
    const restaurant = await prisma.restaurants.findFirst({
      where: { vendor_id: sender.vendor_id },
      select: { id: true },
    });
    if (!restaurant) return 0;
    return prisma.orders.count({
      where: {
        user_id: customerUserId,
        restaurant_id: Number(restaurant.id),
        order_status: { in: [...ACTIVE_ORDER_STATUSES] },
      },
    });
  }
  if (conv.receiver_type === 'vendor' && receiver?.vendor_id != null) {
    const restaurant = await prisma.restaurants.findFirst({
      where: { vendor_id: receiver.vendor_id },
      select: { id: true },
    });
    if (!restaurant) return 0;
    return prisma.orders.count({
      where: {
        user_id: customerUserId,
        restaurant_id: Number(restaurant.id),
        order_status: { in: [...ACTIVE_ORDER_STATUSES] },
      },
    });
  }
  if (conv.sender_type === 'delivery_man' && sender?.deliveryman_id != null) {
    return prisma.orders.count({
      where: {
        user_id: customerUserId,
        delivery_man_id: Number(sender.deliveryman_id),
        order_status: { in: [...ACTIVE_ORDER_STATUSES] },
      },
    });
  }
  if (conv.receiver_type === 'delivery_man' && receiver?.deliveryman_id != null) {
    return prisma.orders.count({
      where: {
        user_id: customerUserId,
        delivery_man_id: Number(receiver.deliveryman_id),
        order_status: { in: [...ACTIVE_ORDER_STATUSES] },
      },
    });
  }
  return 1;
}

async function vendorRestaurantId(vendorId: number): Promise<number | null> {
  const restaurant = await prisma.restaurants.findFirst({
    where: { vendor_id: vendorId },
    select: { id: true },
  });
  return restaurant ? Number(restaurant.id) : null;
}

export async function countActiveOrdersForVendorConversation(
  vendorId: number,
  conv: conversations,
  sender: user_infos | null,
  receiver: user_infos | null
): Promise<number> {
  const restaurantId = await vendorRestaurantId(vendorId);
  if (!restaurantId) return 0;

  const base = {
    restaurant_id: restaurantId,
    order_status: { in: [...ACTIVE_ORDER_STATUSES] },
  };

  if (conv.sender_type === 'customer' && sender?.user_id != null) {
    return prisma.orders.count({
      where: { ...base, user_id: Number(sender.user_id) },
    });
  }
  if (conv.receiver_type === 'customer' && receiver?.user_id != null) {
    return prisma.orders.count({
      where: { ...base, user_id: Number(receiver.user_id) },
    });
  }
  if (conv.sender_type === 'delivery_man' && sender?.deliveryman_id != null) {
    return prisma.orders.count({
      where: { ...base, delivery_man_id: Number(sender.deliveryman_id) },
    });
  }
  if (conv.receiver_type === 'delivery_man' && receiver?.deliveryman_id != null) {
    return prisma.orders.count({
      where: { ...base, delivery_man_id: Number(receiver.deliveryman_id) },
    });
  }
  return 1;
}

export async function countActiveOrdersForDeliveryManConversation(
  deliveryManId: number,
  conv: conversations,
  sender: user_infos | null,
  receiver: user_infos | null
): Promise<number> {
  const base = {
    delivery_man_id: deliveryManId,
    order_status: { in: [...ACTIVE_ORDER_STATUSES] },
  };

  if (conv.sender_type === 'vendor' && sender?.vendor_id != null) {
    const restaurantId = await vendorRestaurantId(Number(sender.vendor_id));
    if (!restaurantId) return 0;
    return prisma.orders.count({ where: { ...base, restaurant_id: restaurantId } });
  }
  if (conv.receiver_type === 'vendor' && receiver?.vendor_id != null) {
    const restaurantId = await vendorRestaurantId(Number(receiver.vendor_id));
    if (!restaurantId) return 0;
    return prisma.orders.count({ where: { ...base, restaurant_id: restaurantId } });
  }
  if (conv.sender_type === 'customer' && sender?.user_id != null) {
    return prisma.orders.count({
      where: { ...base, user_id: Number(sender.user_id) },
    });
  }
  if (conv.receiver_type === 'customer' && receiver?.user_id != null) {
    return prisma.orders.count({
      where: { ...base, user_id: Number(receiver.user_id) },
    });
  }
  return 0;
}

export async function markConversationReadForViewer(
  conversation: conversations,
  viewerUserInfoId: number
) {
  const lastId = toNum(conversation.last_message_id);
  if (lastId == null) return;

  const last = await prisma.messages.findUnique({ where: { id: BigInt(lastId) } });
  if (last && toNum(last.sender_id) !== viewerUserInfoId) {
    await prisma.conversations.update({
      where: { id: conversation.id },
      data: { unread_message_count: BigInt(0), updated_at: new Date() },
    });
  }

  await prisma.messages.updateMany({
    where: {
      conversation_id: Number(conversation.id),
      NOT: { sender_id: viewerUserInfoId },
    },
    data: { is_seen: true, updated_at: new Date() },
  });
}

export { hydrateConversation, ACTIVE_ORDER_STATUSES };
