import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';
import { notifyRestaurantOfWithdrawDecision } from '../../notifications/sendWithdrawNotifications';
import { decimalToNumber, roundMoney, toDecimal } from '../../vendor/walletHelpers';

export type WithdrawApprovedCode = 0 | 1 | 2;

export function withdrawStatusLabel(approved: number): 'pending' | 'approved' | 'denied' {
  if (approved === 1) return 'approved';
  if (approved === 2) return 'denied';
  return 'pending';
}

function statusFilterToCode(status: string): number | null {
  if (status === 'pending') return 0;
  if (status === 'approved') return 1;
  if (status === 'denied') return 2;
  return null;
}

type WithdrawRow = {
  id: bigint;
  vendor_id: unknown;
  amount: unknown;
  approved: number;
  transaction_note: string | null;
  type: string;
  created_at: Date | null;
  updated_at: Date | null;
  withdrawal_method_id: unknown;
  withdrawal_method_fields: string | null;
  restaurant_id: unknown;
  restaurant_name: string | null;
  vendor_f_name: string | null;
  vendor_l_name: string | null;
  vendor_email: string | null;
  vendor_phone: string | null;
  method_name: string | null;
};

function mapWithdrawRow(row: WithdrawRow) {
  const approved = Number(row.approved) as WithdrawApprovedCode;
  return {
    id: Number(row.id),
    vendor_id: row.vendor_id != null ? Number(row.vendor_id) : null,
    restaurant_id: row.restaurant_id != null ? Number(row.restaurant_id) : null,
    restaurant: row.restaurant_name ?? '—',
    vendor_name: [row.vendor_f_name, row.vendor_l_name].filter(Boolean).join(' ').trim() || '—',
    vendor_email: row.vendor_email ?? '',
    vendor_phone: row.vendor_phone ?? '',
    amount: roundMoney(decimalToNumber(row.amount as never)),
    status: withdrawStatusLabel(approved),
    approved,
    type: row.type ?? 'manual',
    note: row.transaction_note ?? '',
    method_id: row.withdrawal_method_id != null ? Number(row.withdrawal_method_id) : null,
    method: row.method_name ?? 'Account',
    method_fields: row.withdrawal_method_fields,
    created_at: row.created_at ? row.created_at.toISOString() : null,
    updated_at: row.updated_at ? row.updated_at.toISOString() : null,
  };
}

export async function listRestaurantWithdrawRequests(query: {
  status: string;
  search?: string;
  page: number;
  limit: number;
}) {
  const code = statusFilterToCode(query.status);
  const search = query.search?.trim() ?? '';
  const like = search ? `%${search}%` : null;
  const offset = (query.page - 1) * query.limit;

  const rows = await prisma.$queryRaw<WithdrawRow[]>`
    SELECT
      wr.id,
      wr.vendor_id,
      wr.amount,
      wr.approved::int AS approved,
      wr.transaction_note,
      wr.type,
      wr.created_at,
      wr.updated_at,
      wr.withdrawal_method_id,
      wr.withdrawal_method_fields,
      r.id AS restaurant_id,
      r.name AS restaurant_name,
      v.f_name AS vendor_f_name,
      v.l_name AS vendor_l_name,
      v.email AS vendor_email,
      v.phone AS vendor_phone,
      wm.method_name
    FROM withdraw_requests wr
    LEFT JOIN vendors v ON v.id = wr.vendor_id::bigint
    LEFT JOIN LATERAL (
      SELECT id, name FROM restaurants
      WHERE vendor_id = wr.vendor_id
      ORDER BY id ASC
      LIMIT 1
    ) r ON true
    LEFT JOIN withdrawal_methods wm ON wm.id = wr.withdrawal_method_id::bigint
    WHERE wr.vendor_id IS NOT NULL
      AND wr.delivery_man_id IS NULL
      AND (${code}::int IS NULL OR wr.approved::int = ${code})
      AND (
        ${like}::text IS NULL
        OR r.name ILIKE ${like}
        OR v.f_name ILIKE ${like}
        OR v.l_name ILIKE ${like}
        OR v.email ILIKE ${like}
        OR v.phone ILIKE ${like}
      )
    ORDER BY wr.id DESC
    LIMIT ${query.limit} OFFSET ${offset}
  `;

  const countRows = await prisma.$queryRaw<Array<{ total: bigint }>>`
    SELECT COUNT(*)::bigint AS total
    FROM withdraw_requests wr
    LEFT JOIN vendors v ON v.id = wr.vendor_id::bigint
    LEFT JOIN LATERAL (
      SELECT id, name FROM restaurants
      WHERE vendor_id = wr.vendor_id
      ORDER BY id ASC
      LIMIT 1
    ) r ON true
    WHERE wr.vendor_id IS NOT NULL
      AND wr.delivery_man_id IS NULL
      AND (${code}::int IS NULL OR wr.approved::int = ${code})
      AND (
        ${like}::text IS NULL
        OR r.name ILIKE ${like}
        OR v.f_name ILIKE ${like}
        OR v.l_name ILIKE ${like}
        OR v.email ILIKE ${like}
        OR v.phone ILIKE ${like}
      )
  `;

  return {
    data: rows.map(mapWithdrawRow),
    total: Number(countRows[0]?.total ?? 0),
    page: query.page,
    limit: query.limit,
  };
}

export async function getRestaurantWithdrawRequest(id: number) {
  const rows = await prisma.$queryRaw<WithdrawRow[]>`
    SELECT
      wr.id,
      wr.vendor_id,
      wr.amount,
      wr.approved::int AS approved,
      wr.transaction_note,
      wr.type,
      wr.created_at,
      wr.updated_at,
      wr.withdrawal_method_id,
      wr.withdrawal_method_fields,
      r.id AS restaurant_id,
      r.name AS restaurant_name,
      v.f_name AS vendor_f_name,
      v.l_name AS vendor_l_name,
      v.email AS vendor_email,
      v.phone AS vendor_phone,
      wm.method_name
    FROM withdraw_requests wr
    LEFT JOIN vendors v ON v.id = wr.vendor_id::bigint
    LEFT JOIN LATERAL (
      SELECT id, name FROM restaurants
      WHERE vendor_id = wr.vendor_id
      ORDER BY id ASC
      LIMIT 1
    ) r ON true
    LEFT JOIN withdrawal_methods wm ON wm.id = wr.withdrawal_method_id::bigint
    WHERE wr.id = ${id}
      AND wr.vendor_id IS NOT NULL
      AND wr.delivery_man_id IS NULL
    LIMIT 1
  `;
  if (!rows.length) return null;
  return mapWithdrawRow(rows[0]!);
}

/**
 * PHP VendorController::withdrawStatus — approve (1) pays out; deny (2) releases pending.
 */
export async function updateRestaurantWithdrawStatus(
  id: number,
  approved: 1 | 2,
  note: string | null | undefined,
  adminId: number | null
): Promise<{ ok: true } | { ok: false; msg: string; status?: number }> {
  const rows = await prisma.$queryRaw<
    Array<{
      id: bigint;
      vendor_id: unknown;
      amount: unknown;
      approved: number;
    }>
  >`
    SELECT id, vendor_id, amount, approved::int AS approved
    FROM withdraw_requests
    WHERE id = ${id}
      AND vendor_id IS NOT NULL
      AND delivery_man_id IS NULL
    LIMIT 1
  `;

  const wr = rows[0];
  if (!wr) return { ok: false, msg: 'Withdraw request not found', status: 404 };

  const prev = Number(wr.approved);
  if (prev !== 0) {
    return { ok: false, msg: 'Only pending withdraw requests can be updated', status: 400 };
  }

  const vendorId = Number(wr.vendor_id);
  const amount = roundMoney(decimalToNumber(wr.amount as never));
  if (!vendorId || amount <= 0) {
    return { ok: false, msg: 'Invalid withdraw request', status: 400 };
  }

  const wallet = await prisma.restaurant_wallets.findFirst({
    where: { vendor_id: toDecimal(vendorId) },
  });
  if (!wallet) return { ok: false, msg: 'Restaurant wallet not found', status: 404 };

  const te = Number(wallet.total_earning);
  const tw = Number(wallet.total_withdrawn);
  const pw = Number(wallet.pending_withdraw);
  if (te < tw + pw) {
    return { ok: false, msg: 'Balance mismatched — total earning is too low', status: 400 };
  }

  const noteValue = note?.trim() ? note.trim() : null;
  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      const w = await tx.restaurant_wallets.findFirst({
        where: { vendor_id: toDecimal(vendorId) },
      });
      if (!w) throw new Error('Wallet missing');

      if (approved === 1) {
        await tx.restaurant_wallets.update({
          where: { id: w.id },
          data: {
            total_withdrawn: new Prisma.Decimal(Number(w.total_withdrawn) + amount),
            pending_withdraw: new Prisma.Decimal(Math.max(0, Number(w.pending_withdraw) - amount)),
            updated_at: now,
          },
        });
      } else {
        await tx.restaurant_wallets.update({
          where: { id: w.id },
          data: {
            pending_withdraw: new Prisma.Decimal(Math.max(0, Number(w.pending_withdraw) - amount)),
            updated_at: now,
          },
        });
      }

      await tx.$executeRaw`
        UPDATE withdraw_requests
        SET approved = ${approved}::smallint,
            transaction_note = ${noteValue},
            admin_id = ${adminId != null ? adminId : null},
            updated_at = ${now}
        WHERE id = ${id}
      `;
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Status update failed';
    return { ok: false, msg, status: 500 };
  }

  const restaurant = await prisma.restaurants.findFirst({
    where: { vendor_id: toDecimal(vendorId) },
    select: { id: true },
    orderBy: { id: 'asc' },
  });

  void notifyRestaurantOfWithdrawDecision({
    vendorId,
    restaurantId: restaurant ? Number(restaurant.id) : null,
    withdrawId: id,
    amount,
    approved,
  }).catch((e) => console.error('[notify] withdraw decision failed', e));

  return { ok: true };
}

/** Pending restaurant withdraw count for admin panel sound alert. */
export async function countPendingRestaurantWithdraws(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ total: bigint }>>`
    SELECT COUNT(*)::bigint AS total
    FROM withdraw_requests
    WHERE vendor_id IS NOT NULL
      AND delivery_man_id IS NULL
      AND approved::int = 0
  `;
  return Number(rows[0]?.total ?? 0);
}
