import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';

/** Search by order id, status, reference, customer, or restaurant name (admin UI). */
export async function buildAdminOrderSearchFilter(
  search: string | undefined
): Promise<Prisma.ordersWhereInput> {
  const q = search?.trim();
  if (!q) return {};

  const idNum = Number(q);
  if (Number.isFinite(idNum) && idNum > 0) {
    return { id: BigInt(Math.trunc(idNum)) };
  }

  const [restaurantIds, userIds] = await Promise.all([
    prisma.restaurants.findMany({
      where: { name: { contains: q, mode: 'insensitive' } },
      select: { id: true },
      take: 200,
    }),
    prisma.users.findMany({
      where: {
        OR: [
          { f_name: { contains: q, mode: 'insensitive' } },
          { l_name: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
      take: 200,
    }),
  ]);

  const or: Prisma.ordersWhereInput[] = [
    { order_status: { contains: q, mode: 'insensitive' } },
    { transaction_reference: { contains: q, mode: 'insensitive' } },
  ];

  if (restaurantIds.length) {
    or.push({ restaurant_id: { in: restaurantIds.map((r) => Number(r.id)) } });
  }
  if (userIds.length) {
    or.push({ user_id: { in: userIds.map((u) => Number(u.id)) } });
  }

  return { OR: or };
}
