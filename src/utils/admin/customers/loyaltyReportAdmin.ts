import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';

function dateRange(from?: string, to?: string) {
  if (!from || !to) return undefined;
  return {
    gte: new Date(`${from}T00:00:00.000Z`),
    lte: new Date(`${to}T23:59:59.999Z`),
  };
}

function buildWhere(query: {
  from?: string;
  to?: string;
  transaction_type?: string;
  customer_id?: number;
  search?: string;
}) {
  const and: Prisma.loyalty_point_transactionsWhereInput[] = [];
  const range = dateRange(query.from, query.to);
  if (range) and.push({ created_at: range });
  if (query.transaction_type?.trim()) {
    and.push({ transaction_type: query.transaction_type.trim() });
  }
  if (query.customer_id) and.push({ user_id: query.customer_id });
  if (query.search?.trim()) {
    const tokens = query.search.trim().split(/\s+/).filter(Boolean);
    and.push({
      OR: tokens.flatMap((t) => [
        { transaction_id: { contains: t, mode: 'insensitive' } },
        { reference: { contains: t, mode: 'insensitive' } },
      ]),
    });
  }
  return and.length ? { AND: and } : {};
}

export async function loyaltyReportAdmin(query: {
  from?: string;
  to?: string;
  transaction_type?: string;
  customer_id?: number;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const where = buildWhere(query);
  const page = query.page ?? 1;
  const limit = query.limit ?? 25;

  const [agg, total, rows] = await Promise.all([
    prisma.loyalty_point_transactions.aggregate({
      where,
      _sum: { credit: true, debit: true },
    }),
    prisma.loyalty_point_transactions.count({ where }),
    prisma.loyalty_point_transactions.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  const ids = [
    ...new Set(rows.map((r) => (r.user_id != null ? Number(r.user_id) : null)).filter(Boolean)),
  ] as number[];
  const users =
    ids.length > 0
      ? await prisma.users.findMany({
          where: { id: { in: ids.map((id) => BigInt(id)) } },
          select: { id: true, f_name: true, l_name: true },
        })
      : [];
  const userMap = new Map(
    users.map((u) => [
      Number(u.id),
      [u.f_name, u.l_name].filter(Boolean).join(' ') || `User #${u.id}`,
    ])
  );

  const totalCredit = Number(agg._sum.credit ?? 0);
  const totalDebit = Number(agg._sum.debit ?? 0);

  return {
    summary: {
      total_credit: totalCredit,
      total_debit: totalDebit,
      balance: totalCredit - totalDebit,
    },
    data: rows.map((r) => {
      const uid = r.user_id != null ? Number(r.user_id) : null;
      return {
        id: r.id.toString(),
        transaction_id: r.transaction_id,
        user_id: uid != null ? String(uid) : null,
        customer: uid ? userMap.get(uid) ?? null : null,
        credit: Number(r.credit),
        debit: Number(r.debit),
        balance: Number(r.balance),
        transaction_type: r.transaction_type,
        reference: r.reference,
        created_at: r.created_at,
      };
    }),
    total,
    page,
    limit,
  };
}
