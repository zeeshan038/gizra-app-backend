import prisma from '../../config/database';

function parseCustomerIds(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return ['all'];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((v) => String(v)) : ['all'];
  } catch {
    return ['all'];
  }
}

function customerMatches(raw: string | null | undefined, customerId: string): boolean {
  const ids = parseCustomerIds(raw);
  return ids.includes('all') || ids.includes(customerId);
}

function isRunning(start: Date | null, end: Date | null, today: Date): boolean {
  if (start && start > today) return false;
  if (end && end < today) return false;
  return true;
}

export function formatCashback(row: {
  id: bigint;
  title: string;
  customer_id: string | null;
  cashback_type: string;
  same_user_limit: bigint;
  total_used: bigint;
  cashback_amount: number;
  min_purchase: number;
  max_discount: number;
  start_date: Date | null;
  end_date: Date | null;
  status: boolean;
}) {
  return {
    id: row.id.toString(),
    title: row.title,
    customer_id: parseCustomerIds(row.customer_id),
    cashback_type: row.cashback_type,
    same_user_limit: Number(row.same_user_limit),
    total_used: Number(row.total_used),
    cashback_amount: Number(row.cashback_amount),
    min_purchase: Number(row.min_purchase),
    max_discount: Number(row.max_discount),
    start_date: row.start_date,
    end_date: row.end_date,
    status: row.status,
  };
}

/** PHP Helpers::getCalculatedCashBackAmount */
export async function getCalculatedCashBackAmount(amount: number, customerId: string | number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const customerKey = String(customerId);

  const rows = await prisma.cash_backs.findMany({
    where: {
      status: true,
      min_purchase: { lte: amount },
    },
    orderBy: { cashback_amount: 'desc' },
  });

  let best: (typeof rows)[number] | null = null;
  let calculated = 0;

  for (const row of rows) {
    if (!isRunning(row.start_date, row.end_date, today)) continue;
    if (!customerMatches(row.customer_id, customerKey)) continue;

    if (Number.isFinite(Number(customerId))) {
      const used = await prisma.cash_back_histories.count({
        where: {
          user_id: Number(customerId),
          cash_back_id: Number(row.id),
        },
      });
      if (used >= Number(row.same_user_limit)) continue;
    }

    let value =
      row.cashback_type === 'percentage'
        ? (amount * Number(row.cashback_amount)) / 100
        : Number(row.cashback_amount);
    if (Number(row.max_discount) > 0) {
      value = Math.min(value, Number(row.max_discount));
    }
    if (value > calculated) {
      calculated = value;
      best = row;
    }
  }

  if (!best || calculated <= 0) {
    return {
      id: null,
      calculated_amount: 0,
      cashback_amount: 0,
      cashback_type: null,
      min_purchase: 0,
      max_discount: 0,
    };
  }

  return {
    id: best.id.toString(),
    calculated_amount: Math.round(calculated * 100) / 100,
    cashback_amount: Number(best.cashback_amount),
    cashback_type: best.cashback_type,
    min_purchase: Number(best.min_purchase),
    max_discount: Number(best.max_discount),
  };
}

export async function listActiveCashbacks(customerId: string | number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const customerKey = String(customerId);

  const rows = await prisma.cash_backs.findMany({
    where: { status: true },
    orderBy: { cashback_amount: 'desc' },
  });

  const out = [];
  for (const row of rows) {
    if (!isRunning(row.start_date, row.end_date, today)) continue;
    if (!customerMatches(row.customer_id, customerKey)) continue;
    if (Number.isFinite(Number(customerId))) {
      const used = await prisma.cash_back_histories.count({
        where: {
          user_id: Number(customerId),
          cash_back_id: Number(row.id),
        },
      });
      if (used >= Number(row.same_user_limit)) continue;
    }
    out.push(formatCashback(row));
  }
  return out;
}
