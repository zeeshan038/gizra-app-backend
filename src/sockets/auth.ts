import jwt from 'jsonwebtoken';
import prisma from '../config/database';
import { getDeliveryManFcmTopics } from '../utils/deliveryman/pushTopics';
import type { SocketActor, SocketJwtPayload } from '../types/sockets/auth';

export type { SocketActor } from '../types/sockets/auth';

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_here';

async function authenticateVendor(
  token: string,
  subjectId: string,
  decoded: SocketJwtPayload
): Promise<SocketActor | null> {
  const vendor = await prisma.vendors.findUnique({
    where: { id: Number(subjectId) },
    select: { id: true, auth_token: true, status: true },
  });

  if (!vendor || vendor.status === false || vendor.auth_token !== token.trim()) return null;

  let restaurantId = decoded.restaurant_id ? Number(decoded.restaurant_id) : null;
  if (!restaurantId) {
    const restaurant = await prisma.restaurants.findFirst({
      where: { vendor_id: Number(vendor.id) },
      select: { id: true },
    });
    restaurantId = restaurant ? Number(restaurant.id) : null;
  }
  if (!restaurantId) return null;

  return { role: 'vendor', vendorId: Number(vendor.id), restaurantId };
}

export async function authenticateSocketToken(token: string): Promise<SocketActor | null> {
  if (!token?.trim()) return null;

  let decoded: SocketJwtPayload;
  try {
    decoded = jwt.verify(token.trim(), JWT_SECRET) as SocketJwtPayload;
  } catch {
    return null;
  }

  const subjectId = decoded.id || decoded._id;
  if (!subjectId) return null;

  const role = decoded.role;

  if (role === 'vendor') {
    return authenticateVendor(token, subjectId, decoded);
  }

  if (role === 'delivery_man') {
    const dm = await prisma.delivery_men.findUnique({
      where: { id: BigInt(subjectId) },
      select: {
        id: true,
        auth_token: true,
        status: true,
        application_status: true,
        type: true,
        zone_id: true,
        vehicle_id: true,
        restaurant_id: true,
      },
    });
    if (!dm || dm.status === false || dm.application_status !== 'approved') return null;
    if (dm.auth_token !== token.trim()) return null;
    const subscribeTopics = await getDeliveryManFcmTopics(dm);
    return {
      role: 'delivery_man',
      deliveryManId: Number(dm.id),
      subscribeTopics,
    };
  }

  if (role == null) {
    const dmByToken = await prisma.delivery_men.findFirst({
      where: {
        auth_token: token.trim(),
        application_status: 'approved',
        status: true,
      },
      select: {
        id: true,
        type: true,
        zone_id: true,
        vehicle_id: true,
        restaurant_id: true,
      },
    });
    if (dmByToken) {
      const subscribeTopics = await getDeliveryManFcmTopics(dmByToken);
      return {
        role: 'delivery_man',
        deliveryManId: Number(dmByToken.id),
        subscribeTopics,
      };
    }
  }

  if (role === 'guest') {
    const guestId = Number(subjectId);
    if (!Number.isFinite(guestId)) return null;
    const guest = await prisma.guests.findUnique({
      where: { id: BigInt(guestId) },
      select: { id: true },
    });
    if (!guest) return null;
    return { role: 'customer', userId: guestId, isGuest: true };
  }

  if (role === 'customer' || role == null) {
    const userId = Number(subjectId);
    if (!Number.isFinite(userId)) return null;
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });
    if (user && user.status !== false) {
      return { role: 'customer', userId: Number(user.id), isGuest: false };
    }
    if (role === 'customer') return null;
  }

  // Legacy vendor JWTs without a role claim
  if (role == null) {
    return authenticateVendor(token, subjectId, decoded);
  }

  return null;
}

export async function canAccessOrder(actor: SocketActor, orderId: number): Promise<boolean> {
  const order = await prisma.orders.findUnique({
    where: { id: BigInt(orderId) },
    select: {
      restaurant_id: true,
      user_id: true,
      delivery_man_id: true,
      order_type: true,
      is_guest: true,
    },
  });
  if (!order || order.order_type === 'pos') return false;

  if (actor.role === 'vendor') {
    return Number(order.restaurant_id) === actor.restaurantId;
  }
  if (actor.role === 'customer') {
    if (order.user_id == null) return false;
    if (Number(order.user_id) !== actor.userId) return false;
    if (actor.isGuest) return order.is_guest === true;
    return order.is_guest !== true;
  }
  if (actor.role === 'delivery_man') {
    return (
      order.delivery_man_id != null &&
      Number(order.delivery_man_id) === actor.deliveryManId
    );
  }
  return false;
}

export async function canAccessConversation(
  actor: SocketActor,
  conversationId: number
): Promise<boolean> {
  const conversation = await prisma.conversations.findUnique({
    where: { id: BigInt(conversationId) },
    select: { sender_id: true, receiver_id: true },
  });
  if (!conversation) return false;

  const senderId = conversation.sender_id != null ? Number(conversation.sender_id) : null;
  const receiverId = Number(conversation.receiver_id);

  if (actor.role === 'customer') {
    const info = await prisma.user_infos.findFirst({
      where: { user_id: actor.userId },
      select: { id: true },
    });
    if (!info) return false;
    const id = Number(info.id);
    return id === senderId || id === receiverId;
  }

  if (actor.role === 'vendor') {
    const info = await prisma.user_infos.findFirst({
      where: { vendor_id: actor.vendorId },
      select: { id: true },
    });
    if (!info) return false;
    const id = Number(info.id);
    return id === senderId || id === receiverId;
  }

  if (actor.role === 'delivery_man') {
    const info = await prisma.user_infos.findFirst({
      where: { deliveryman_id: actor.deliveryManId },
      select: { id: true },
    });
    if (!info) return false;
    const id = Number(info.id);
    return id === senderId || id === receiverId;
  }

  return false;
}
