import prisma from '../../../config/database';
import { formatCustomerName } from '../../vendor/order/mapper';

export async function listAdminSubscriptions(params: { search?: string; limit?: number; offset?: number }) {
  const { search, limit = 50, offset = 0 } = params;
  const where = search?.trim()
    ? {
        OR: [
          { status: { contains: search.trim(), mode: 'insensitive' as const } },
          { type: { contains: search.trim(), mode: 'insensitive' as const } },
        ],
      }
    : {};

  const [total, rows] = await Promise.all([
    prisma.subscriptions.count({ where }),
    prisma.subscriptions.findMany({
      where,
      orderBy: { id: 'desc' },
      skip: offset,
      take: Math.min(Math.max(limit, 1), 100),
    }),
  ]);

  const restaurantIds = [...new Set(rows.map((r) => Number(r.restaurant_id)))];
  const userIds = [...new Set(rows.map((r) => Number(r.user_id)))];

  const [restaurants, users, deliveredBySub] = await Promise.all([
    prisma.restaurants.findMany({
      where: { id: { in: restaurantIds.map((id) => BigInt(id)) } },
      select: { id: true, name: true },
    }),
    prisma.users.findMany({
      where: { id: { in: userIds.map((id) => BigInt(id)) } },
      select: { id: true, f_name: true, l_name: true, phone: true },
    }),
    prisma.subscription_logs.groupBy({
      by: ['subscription_id'],
      where: { order_status: 'delivered' },
      _count: { subscription_id: true },
    }),
  ]);

  const restaurantById = new Map(restaurants.map((r) => [Number(r.id), r.name]));
  const userById = new Map(users.map((u) => [Number(u.id), u]));
  const deliveredMap = new Map(
    deliveredBySub.map((g) => [Number(g.subscription_id), g._count.subscription_id])
  );

  const subscriptions = rows.map((sub) => {
    const user = userById.get(Number(sub.user_id));
    return {
      id: sub.id.toString(),
      order_id: null,
      type: sub.type ?? '',
      start_at: sub.start_at?.toISOString().slice(0, 10) ?? null,
      end_at: sub.end_at?.toISOString().slice(0, 10) ?? null,
      restaurant_id: sub.restaurant_id.toString(),
      restaurant_name: restaurantById.get(Number(sub.restaurant_id)) ?? '—',
      customer_name: formatCustomerName(user ?? null),
      customer_phone: user?.phone ?? null,
      status: sub.status ?? 'active',
      quantity: Number(sub.quantity),
      delivered_count: deliveredMap.get(Number(sub.id)) ?? 0,
    };
  });

  return { subscriptions, total };
}

export async function getAdminSubscriptionDetail(subscriptionId: number) {
  const sub = await prisma.subscriptions.findUnique({ where: { id: BigInt(subscriptionId) } });
  if (!sub) return null;

  const [restaurant, user, logs] = await Promise.all([
    prisma.restaurants.findUnique({
      where: { id: BigInt(Number(sub.restaurant_id)) },
      select: { name: true },
    }),
    prisma.users.findUnique({
      where: { id: BigInt(Number(sub.user_id)) },
      select: { f_name: true, l_name: true, phone: true },
    }),
    prisma.subscription_logs.findMany({
      where: { subscription_id: Number(sub.id) },
      orderBy: { id: 'desc' },
      take: 20,
    }),
  ]);

  const delivered_count = logs.filter((l) => l.order_status === 'delivered').length;

  return {
    id: sub.id.toString(),
    type: sub.type ?? '',
    start_at: sub.start_at?.toISOString().slice(0, 10) ?? null,
    end_at: sub.end_at?.toISOString().slice(0, 10) ?? null,
    restaurant_id: sub.restaurant_id.toString(),
    restaurant_name: restaurant?.name ?? '—',
    customer_name: formatCustomerName(user ?? null),
    customer_phone: user?.phone ?? null,
    status: sub.status ?? 'active',
    quantity: Number(sub.quantity),
    delivered_count,
    billing_amount: Number(sub.billing_amount),
    paid_amount: Number(sub.paid_amount),
    logs: logs.map((l) => ({
      id: l.id.toString(),
      order_status: l.order_status,
      schedule_at: l.schedule_at?.toISOString() ?? null,
    })),
  };
}
