import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';

export async function listSubscribersAdmin(query: {
  search?: string;
  filter?: string;
  join_date_from?: string;
  join_date_to?: string;
  show_limit?: number;
  page?: number;
  limit?: number;
}) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 25;
  const and: Prisma.newslettersWhereInput[] = [];

  if (query.search?.trim()) {
    const tokens = query.search.trim().split(/\s+/).filter(Boolean);
    and.push({
      OR: tokens.map((t) => ({ email: { contains: t, mode: 'insensitive' } })),
    });
  }

  if (query.join_date_from && query.join_date_to) {
    and.push({
      created_at: {
        gte: new Date(`${query.join_date_from}T00:00:00.000Z`),
        lte: new Date(`${query.join_date_to}T23:59:59.999Z`),
      },
    });
  }

  const where = and.length ? { AND: and } : {};
  const orderBy =
    query.filter === 'oldest'
      ? { created_at: 'asc' as const }
      : { created_at: 'desc' as const };

  const takeAll = query.show_limit && query.show_limit > 0 ? query.show_limit : undefined;
  const [total, rows] = await Promise.all([
    prisma.newsletters.count({ where }),
    prisma.newsletters.findMany({
      where,
      orderBy,
      ...(takeAll ? { take: takeAll } : { skip: (page - 1) * limit, take: limit }),
    }),
  ]);

  return {
    data: rows.map((r) => ({
      id: Number(r.id),
      email: r.email,
      created_at: r.created_at,
    })),
    total: takeAll ? rows.length : total,
    page,
    limit,
  };
}
