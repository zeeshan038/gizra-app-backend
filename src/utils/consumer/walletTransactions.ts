import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { getBusinessSettingFlag, getBusinessSettingNumber } from './businessSettings';

type DbClient = Prisma.TransactionClient | typeof prisma;

const WALLET_CREDIT_TYPES = new Set([
  'add_fund_by_admin',
  'add_fund',
  'order_refund',
  'loyalty_point',
  'referrer',
  'CashBack',
]);

export function formatWalletTransaction(row: {
  id: bigint;
  user_id: unknown;
  transaction_id: string;
  credit: unknown;
  debit: unknown;
  admin_bonus: unknown;
  balance: unknown;
  transaction_type: string | null;
  reference: string | null;
  created_at: Date | null;
  updated_at: Date | null;
}) {
  return {
    id: row.id.toString(),
    user_id: row.user_id != null ? String(row.user_id) : null,
    transaction_id: row.transaction_id,
    credit: Number(row.credit),
    debit: Number(row.debit),
    admin_bonus: Number(row.admin_bonus),
    balance: Number(row.balance),
    transaction_type: row.transaction_type,
    reference: row.reference,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function formatLoyaltyTransaction(row: {
  id: bigint;
  user_id: unknown;
  transaction_id: string;
  credit: unknown;
  debit: unknown;
  balance: unknown;
  transaction_type: string | null;
  reference: string | null;
  created_at: Date | null;
  updated_at: Date | null;
}) {
  return {
    id: row.id.toString(),
    user_id: row.user_id != null ? String(row.user_id) : null,
    transaction_id: row.transaction_id,
    credit: Number(row.credit),
    debit: Number(row.debit),
    balance: Number(row.balance),
    transaction_type: row.transaction_type,
    reference: row.reference,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function calculateWalletBonus(addAmount: number): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const bonuses = await prisma.wallet_bonuses.findMany({
    where: {
      status: true,
      minimum_add_amount: { lte: addAmount },
      OR: [{ start_date: null }, { start_date: { lte: today } }],
    },
  });

  let percentBonus = 0;
  let amountBonus = 0;

  for (const bonus of bonuses) {
    if (bonus.end_date && bonus.end_date < today) continue;
    if (bonus.bonus_type === 'percentage') {
      const raw = (addAmount * Number(bonus.bonus_amount)) / 100;
      const capped =
        Number(bonus.maximum_bonus_amount) > 0
          ? Math.min(raw, Number(bonus.maximum_bonus_amount))
          : raw;
      percentBonus = Math.max(percentBonus, capped);
    } else if (bonus.bonus_type === 'amount') {
      amountBonus = Math.max(amountBonus, Number(bonus.bonus_amount));
    }
  }

  return Math.max(percentBonus, amountBonus);
}

/** PHP CustomerLogic::create_wallet_transaction */
export async function createWalletTransaction(
  db: DbClient,
  params: {
    userId: number;
    amount: number;
    transactionType: string;
    reference?: string | number | null;
    skipStatusCheck?: boolean;
  }
) {
  if (!params.skipStatusCheck && !(await getBusinessSettingFlag('wallet_status'))) {
    return null;
  }

  const user = await db.users.findUnique({
    where: { id: BigInt(params.userId) },
    select: { id: true, wallet_balance: true },
  });
  if (!user) throw new Error('Customer not found');

  let credit = 0;
  let debit = 0;
  let adminBonus = 0;

  if (WALLET_CREDIT_TYPES.has(params.transactionType)) {
    credit = params.amount;
    if (params.transactionType === 'add_fund') {
      adminBonus = await calculateWalletBonus(params.amount);
    } else if (params.transactionType === 'loyalty_point') {
      const rate = await getBusinessSettingNumber('loyalty_point_exchange_rate', 1);
      credit = rate > 0 ? Math.floor(params.amount / rate) : 0;
    }
  } else if (
    params.transactionType === 'order_place' ||
    params.transactionType === 'partial_payment'
  ) {
    debit = params.amount;
  }

  const current = Number(user.wallet_balance);
  const nextBalance = current + credit + adminBonus - debit;
  const now = new Date();

  const row = await db.wallet_transactions.create({
    data: {
      user_id: params.userId,
      transaction_id: randomUUID(),
      credit,
      debit,
      admin_bonus: adminBonus,
      balance: nextBalance,
      transaction_type: params.transactionType,
      reference: params.reference != null ? String(params.reference) : null,
      created_at: now,
      updated_at: now,
    },
  });

  await db.users.update({
    where: { id: user.id },
    data: { wallet_balance: nextBalance, updated_at: now },
  });

  return row;
}

/** PHP CustomerLogic::create_loyalty_point_transaction */
export async function createLoyaltyPointTransaction(
  db: DbClient,
  params: {
    userId: number;
    amount: number;
    transactionType: string;
    reference?: string | number | null;
  }
) {
  if (!(await getBusinessSettingFlag('loyalty_point_status'))) {
    return null;
  }

  const user = await db.users.findUnique({
    where: { id: BigInt(params.userId) },
    select: { id: true, loyalty_point: true },
  });
  if (!user) throw new Error('Customer not found');

  let credit = 0;
  let debit = 0;
  if (params.transactionType === 'order_place') {
    const purchasePoint = await getBusinessSettingNumber(
      'loyalty_point_item_purchase_point',
      0
    );
    credit = Math.floor((params.amount * purchasePoint) / 100);
  } else if (params.transactionType === 'point_to_wallet') {
    debit = params.amount;
  }

  const nextBalance = Number(user.loyalty_point) + credit - debit;
  const now = new Date();

  const row = await db.loyalty_point_transactions.create({
    data: {
      user_id: params.userId,
      transaction_id: randomUUID(),
      credit,
      debit,
      balance: nextBalance,
      transaction_type: params.transactionType,
      reference: params.reference != null ? String(params.reference) : null,
      created_at: now,
      updated_at: now,
    },
  });

  await db.users.update({
    where: { id: user.id },
    data: { loyalty_point: nextBalance, updated_at: now },
  });

  return row;
}

export const WALLET_TX_TYPE_FILTERS: Record<string, string[]> = {
  order: ['order_place', 'order_refund', 'partial_payment'],
  loyalty_point: ['loyalty_point'],
  add_fund: ['add_fund'],
  referrer: ['referrer'],
  CashBack: ['CashBack'],
};
