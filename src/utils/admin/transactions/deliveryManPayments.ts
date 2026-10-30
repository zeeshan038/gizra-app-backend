import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';
import { decimalToNumber, roundMoney, toDecimal } from '../../vendor/walletHelpers';

async function deliveryManIdsMatchingSearch(search?: string): Promise<number[] | undefined> {
  const tokens = search?.trim() ? search.trim().split(/\s+/).filter(Boolean) : [];
  if (!tokens.length) return undefined;
  const rows = await prisma.delivery_men.findMany({
    where: {
      OR: tokens.flatMap((t) => [
        { f_name: { contains: t, mode: 'insensitive' } },
        { l_name: { contains: t, mode: 'insensitive' } },
        { phone: { contains: t, mode: 'insensitive' } },
        { email: { contains: t, mode: 'insensitive' } },
      ]),
    },
    select: { id: true },
    take: 500,
  });
  return rows.map((r) => Number(r.id));
}

/** PHP ProvideDMEarningController: total_earning - total_withdrawn - pending_withdraw */
export function deliveryManPayableBalance(wallet: {
  total_earning: Prisma.Decimal | number | null;
  total_withdrawn: Prisma.Decimal | number | null;
  pending_withdraw: Prisma.Decimal | number | null;
}): number {
  const te = decimalToNumber(wallet.total_earning);
  const tw = decimalToNumber(wallet.total_withdrawn);
  const pw = decimalToNumber(wallet.pending_withdraw);
  return roundMoney(Math.max(0, te - tw - pw));
}

export async function listDeliveryManPayments(query: {
  search?: string;
  page: number;
  limit: number;
}) {
  const skip = (query.page - 1) * query.limit;
  const dmIds = await deliveryManIdsMatchingSearch(query.search);

  const where: Prisma.provide_d_m_earningsWhereInput = dmIds?.length
    ? { delivery_man_id: { in: dmIds.map((id) => toDecimal(id)) } }
    : query.search?.trim()
      ? { delivery_man_id: { in: [] } }
      : {};

  const [rows, total] = await Promise.all([
    prisma.provide_d_m_earnings.findMany({
      where,
      orderBy: { id: 'desc' },
      skip,
      take: query.limit,
    }),
    prisma.provide_d_m_earnings.count({ where }),
  ]);

  const idSet = [...new Set(rows.map((r) => Number(r.delivery_man_id)))];
  const dms =
    idSet.length > 0
      ? await prisma.delivery_men.findMany({
          where: { id: { in: idSet.map((id) => BigInt(id)) } },
          select: { id: true, f_name: true, l_name: true, phone: true },
        })
      : [];
  const dmMap = new Map(dms.map((d) => [Number(d.id), d]));

  const data = rows.map((row) => {
    const dm = dmMap.get(Number(row.delivery_man_id));
    return {
      id: Number(row.id),
      delivery_man_id: Number(row.delivery_man_id),
      name: dm ? [dm.f_name, dm.l_name].filter(Boolean).join(' ') : '—',
      phone: dm?.phone ?? null,
      amount: roundMoney(decimalToNumber(row.amount)),
      method: row.method ?? '',
      ref: row.ref ?? null,
      created_at: row.created_at?.toISOString() ?? null,
    };
  });

  return { data, total, page: query.page, limit: query.limit };
}

export async function createDeliveryManPayment(input: {
  delivery_man_id: number;
  amount: number;
  method: string;
  ref?: string | null;
}) {
  const amount = roundMoney(Number(input.amount));
  const method = input.method.trim();
  const ref = input.ref?.trim() ? input.ref.trim() : null;

  const dm = await prisma.delivery_men.findUnique({
    where: { id: BigInt(input.delivery_man_id) },
    select: { id: true },
  });
  if (!dm) throw new Error('Delivery man not found');

  let wallet = await prisma.delivery_man_wallets.findFirst({
    where: { delivery_man_id: input.delivery_man_id },
  });
  if (!wallet) {
    const now = new Date();
    wallet = await prisma.delivery_man_wallets.create({
      data: {
        delivery_man_id: input.delivery_man_id,
        created_at: now,
        updated_at: now,
      },
    });
  }

  const payable = deliveryManPayableBalance(wallet);
  if (roundMoney(amount) > payable) {
    throw new Error(`Insufficient balance. Maximum payable is ${payable}`);
  }

  const now = new Date();
  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.provide_d_m_earnings.create({
      data: {
        delivery_man_id: toDecimal(input.delivery_man_id),
        amount,
        method,
        ref,
        created_at: now,
        updated_at: now,
      },
    });

    const w = await tx.delivery_man_wallets.findFirst({
      where: { delivery_man_id: input.delivery_man_id },
    });
    if (!w) throw new Error('Wallet missing');

    await tx.delivery_man_wallets.update({
      where: { id: w.id },
      data: {
        total_withdrawn: new Prisma.Decimal(decimalToNumber(w.total_withdrawn) + amount),
        updated_at: now,
      },
    });

    return row;
  });

  return {
    id: Number(created.id),
    delivery_man_id: input.delivery_man_id,
    amount,
    method,
    ref,
    created_at: created.created_at?.toISOString() ?? null,
  };
}
