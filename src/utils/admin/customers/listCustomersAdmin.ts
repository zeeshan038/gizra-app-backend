import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';
import { publicMediaUrl } from '../../mediaStorage';

export type AdminCustomerListQuery = {
  search?: string;
  filter?: string;
  order_wise?: string;
  zone_id?: number;
  order_date_from?: string;
  order_date_to?: string;
  join_date_from?: string;
  join_date_to?: string;
  show_limit?: number;
  page?: number;
  limit?: number;
};

function parseDayRange(from?: string, to?: string) {
  if (!from || !to) return null;
  return {
    gte: new Date(`${from}T00:00:00.000Z`),
    lte: new Date(`${to}T23:59:59.999Z`),
  };
}

export async function listCustomersAdmin(query: AdminCustomerListQuery) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 25;
  const and: Prisma.usersWhereInput[] = [];

  if (query.search?.trim()) {
    const tokens = query.search.trim().split(/\s+/).filter(Boolean);
    and.push({
      OR: tokens.flatMap((t) => [
        { f_name: { contains: t, mode: 'insensitive' } },
        { l_name: { contains: t, mode: 'insensitive' } },
        { email: { contains: t, mode: 'insensitive' } },
        { phone: { contains: t, mode: 'insensitive' } },
      ]),
    });
  }

  const joinRange = parseDayRange(query.join_date_from, query.join_date_to);
  if (joinRange) and.push({ created_at: joinRange });

  if (query.zone_id) and.push({ zone_id: query.zone_id });

  if (query.filter === 'active') and.push({ status: true });
  if (query.filter === 'blocked') and.push({ status: false });
  if (query.filter === 'new') {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    and.push({ created_at: { gte: since } });
  }

  const orderRange = parseDayRange(query.order_date_from, query.order_date_to);
  if (orderRange) {
    const orderUsers = await prisma.orders.findMany({
      where: { created_at: orderRange, user_id: { not: null } },
      select: { user_id: true },
      distinct: ['user_id'],
    });
    const ids = orderUsers.map((o) => BigInt(Number(o.user_id)));
    and.push({ id: { in: ids.length ? ids : [BigInt(-1)] } });
  }

  const where: Prisma.usersWhereInput = and.length ? { AND: and } : {};

  let orderBy: Prisma.usersOrderByWithRelationInput = { order_count: 'desc' };
  if (query.order_wise === 'latest') orderBy = { created_at: 'desc' };
  if (query.order_wise === 'oldest') orderBy = { created_at: 'asc' };
  if (query.order_wise === 'least') orderBy = { order_count: 'asc' };
  if (query.order_wise === 'top') orderBy = { order_count: 'desc' };

  const takeAll = query.show_limit && query.show_limit > 0 ? query.show_limit : undefined;

  let rows = await prisma.users.findMany({
    where,
    orderBy: query.order_wise === 'order_amount' ? { created_at: 'desc' } : orderBy,
    ...(takeAll ? { take: takeAll } : { skip: (page - 1) * limit, take: limit }),
  });

  const total = takeAll ? rows.length : await prisma.users.count({ where });

  const userIds = rows.map((u) => Number(u.id));
  const orderStats = new Map<number, { count: number; amount: number }>();
  if (userIds.length) {
    const grouped = await prisma.orders.groupBy({
      by: ['user_id'],
      where: { user_id: { in: userIds } },
      _count: { id: true },
      _sum: { order_amount: true },
    });
    for (const g of grouped) {
      if (g.user_id == null) continue;
      orderStats.set(Number(g.user_id), {
        count: g._count.id,
        amount: Number(g._sum.order_amount ?? 0),
      });
    }
  }

  if (query.order_wise === 'order_amount') {
    rows = [...rows].sort(
      (a, b) =>
        (orderStats.get(Number(b.id))?.amount ?? 0) - (orderStats.get(Number(a.id))?.amount ?? 0)
    );
    if (!takeAll) {
      rows = rows.slice(0, limit);
    }
  }

  const data = rows.map((u) => {
    const uid = Number(u.id);
    const stats = orderStats.get(uid);
    return {
      id: uid,
      f_name: u.f_name,
      l_name: u.l_name,
      name: [u.f_name, u.l_name].filter(Boolean).join(' ') || 'Incomplete profile',
      email: u.email,
      phone: u.phone,
      image: publicMediaUrl(u.image),
      status: u.status,
      zone_id: u.zone_id != null ? Number(u.zone_id) : null,
      wallet_balance: Number(u.wallet_balance),
      loyalty_point: Number(u.loyalty_point),
      order_count: stats?.count ?? Number(u.order_count),
      total_order_amount: stats?.amount ?? 0,
      created_at: u.created_at,
    };
  });

  return { data, total, page, limit };
}
