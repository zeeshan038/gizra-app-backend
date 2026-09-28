import jwt from 'jsonwebtoken';
import prisma from '../config/database';
import type { SocketActor, SocketJwtPayload } from '../types/sockets/auth';

export type { SocketActor } from '../types/sockets/auth';

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_here';

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

  const role = decoded.role ?? 'vendor';

  if (role === 'vendor') {
    const vendor = await prisma.vendors.findUnique({
      where: { id: Number(subjectId) },
      select: { id: true, auth_token: true, status: true },
    });
    if (!vendor?.status || vendor.auth_token !== token.trim()) return null;

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

  if (role === 'customer') {
    const user = await prisma.users.findUnique({
      where: { id: Number(subjectId) },
      select: { id: true, status: true },
    });
    if (!user?.status) return null;
    return { role: 'customer', userId: Number(user.id) };
  }

  if (role === 'delivery_man') {
    const dm = await prisma.delivery_men.findUnique({
      where: { id: BigInt(subjectId) },
      select: { id: true, auth_token: true, status: true, application_status: true },
    });
    if (!dm || !dm.status || dm.application_status !== 'approved') return null;
    if (dm.auth_token !== token.trim()) return null;
    return { role: 'delivery_man', deliveryManId: Number(dm.id) };
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
    },
  });
  if (!order || order.order_type === 'pos') return false;

  if (actor.role === 'vendor') {
    return Number(order.restaurant_id) === actor.restaurantId;
  }
  if (actor.role === 'customer') {
    return order.user_id != null && Number(order.user_id) === actor.userId;
  }
  if (actor.role === 'delivery_man') {
    return (
      order.delivery_man_id != null &&
      Number(order.delivery_man_id) === actor.deliveryManId
    );
  }
  return false;
}
