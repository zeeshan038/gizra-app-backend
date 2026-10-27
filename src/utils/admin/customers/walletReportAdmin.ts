import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';
import { formatWalletTransaction } from '../../consumer/walletTransactions';

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
}) {
  const and: Prisma.wallet_transactionsWhereInput[] = [{ delivery_man_id: null }];
  const range = dateRange(query.from, query.to);
  if (range) and.push({ created_at: range });
  if (query.transaction_type?.trim()) {
    and.push({ transaction_type: query.transaction_type.trim() });
  }
  if (query.customer_id) and.push({ user_id: query.customer_id });
  return { AND: and };
}

async function attachUsers(rows: { user_id: unknown }[]) {
  const ids = [...new Set(rows.map((r) => (r.user_id != null ? Number(r.user_id) : null)).filter(Boolean))] as number[];
  const users =
    ids.length > 0
      ? await prisma.users.findMany({
          where: { id: { in: ids.map((id) => BigInt(id)) } },
          select: { id: true, f_name: true, l_name: true, phone: true },
        })
      : [];
  const map = new Map(
    users.map((u) => [
      Number(u.id),
      [u.f_name, u.l_name].filter(Boolean).join(' ') || `User #${u.id}`,
    ])
  );
  return map;
}

export async function walletReportAdmin(query: {
  from?: string;
  to?: string;
  transaction_type?: string;
  customer_id?: number;
  page?: number;
  limit?: number;
}) {
  const where = buildWhere(query);
  const page = query.page ?? 1;
  const limit = query.limit ?? 25;

  const [agg, total, rows] = await Promise.all([
    prisma.wallet_transactions.aggregate({
      where,
      _sum: { credit: true, debit: true },
    }),
    prisma.wallet_transactions.count({ where }),
    prisma.wallet_transactions.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  const userMap = await attachUsers(rows);
  const data = rows.map((r) => {
    const uid = r.user_id != null ? Number(r.user_id) : null;
    return {
      ...formatWalletTransaction(r),
      customer: uid ? userMap.get(uid) ?? null : null,
    };
  });

  const totalCredit = Number(agg._sum.credit ?? 0);
  const totalDebit = Number(agg._sum.debit ?? 0);

  return {
    summary: {
      total_credit: totalCredit,
      total_debit: totalDebit,
      balance: totalCredit - totalDebit,
    },
    data,
    total,
    page,
    limit,
  };
}
