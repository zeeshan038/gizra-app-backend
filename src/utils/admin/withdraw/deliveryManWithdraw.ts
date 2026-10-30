import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';
import { notifyDeliveryManOfWithdrawDecision } from '../../notifications/sendWithdrawNotifications';
import { decimalToNumber, roundMoney } from '../../vendor/walletHelpers';
import {
  type WithdrawApprovedCode,
  withdrawStatusLabel,
} from './restaurantWithdraw';

function statusFilterToCode(status: string): number | null {
  if (status === 'pending') return 0;
  if (status === 'approved') return 1;
  if (status === 'denied') return 2;
  return null;
}

type WithdrawRow = {
  id: bigint;
  delivery_man_id: unknown;
  amount: unknown;
  approved: number;
  transaction_note: string | null;
  type: string;
  created_at: Date | null;
  updated_at: Date | null;
  withdrawal_method_id: unknown;
  withdrawal_method_fields: string | null;
  dm_f_name: string | null;
  dm_l_name: string | null;
  dm_email: string | null;
  dm_phone: string | null;
  method_name: string | null;
};

function mapWithdrawRow(row: WithdrawRow) {
  const approved = Number(row.approved) as WithdrawApprovedCode;
  const dmName = [row.dm_f_name, row.dm_l_name].filter(Boolean).join(' ').trim() || '—';
  return {
    id: Number(row.id),
    delivery_man_id: row.delivery_man_id != null ? Number(row.delivery_man_id) : null,
    delivery_man_name: dmName,
    delivery_man_email: row.dm_email ?? '',
    delivery_man_phone: row.dm_phone ?? '',
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

export async function listDeliveryManWithdrawRequests(query: {
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
      wr.delivery_man_id,
      wr.amount,
      wr.approved::int AS approved,
      wr.transaction_note,
      wr.type,
      wr.created_at,
      wr.updated_at,
      wr.withdrawal_method_id,
      wr.withdrawal_method_fields,
      dm.f_name AS dm_f_name,
      dm.l_name AS dm_l_name,
      dm.email AS dm_email,
      dm.phone AS dm_phone,
      wm.method_name
    FROM withdraw_requests wr
    LEFT JOIN delivery_men dm ON dm.id = wr.delivery_man_id::bigint
    LEFT JOIN withdrawal_methods wm ON wm.id = wr.withdrawal_method_id::bigint
    WHERE wr.delivery_man_id IS NOT NULL
      AND wr.vendor_id IS NULL
      AND (${code}::int IS NULL OR wr.approved::int = ${code})
      AND (
        ${like}::text IS NULL
        OR dm.f_name ILIKE ${like}
        OR dm.l_name ILIKE ${like}
        OR dm.email ILIKE ${like}
        OR dm.phone ILIKE ${like}
      )
    ORDER BY wr.id DESC
    LIMIT ${query.limit} OFFSET ${offset}
  `;

  const countRows = await prisma.$queryRaw<Array<{ total: bigint }>>`
    SELECT COUNT(*)::bigint AS total
    FROM withdraw_requests wr
    LEFT JOIN delivery_men dm ON dm.id = wr.delivery_man_id::bigint
    WHERE wr.delivery_man_id IS NOT NULL
      AND wr.vendor_id IS NULL
      AND (${code}::int IS NULL OR wr.approved::int = ${code})
      AND (
        ${like}::text IS NULL
        OR dm.f_name ILIKE ${like}
        OR dm.l_name ILIKE ${like}
        OR dm.email ILIKE ${like}
        OR dm.phone ILIKE ${like}
      )
  `;

  return {
    data: rows.map(mapWithdrawRow),
    total: Number(countRows[0]?.total ?? 0),
    page: query.page,
    limit: query.limit,
  };
}

export async function getDeliveryManWithdrawRequest(id: number) {
  const rows = await prisma.$queryRaw<WithdrawRow[]>`
    SELECT
      wr.id,
      wr.delivery_man_id,
      wr.amount,
      wr.approved::int AS approved,
      wr.transaction_note,
      wr.type,
      wr.created_at,
      wr.updated_at,
      wr.withdrawal_method_id,
      wr.withdrawal_method_fields,
      dm.f_name AS dm_f_name,
      dm.l_name AS dm_l_name,
      dm.email AS dm_email,
      dm.phone AS dm_phone,
      wm.method_name
    FROM withdraw_requests wr
    LEFT JOIN delivery_men dm ON dm.id = wr.delivery_man_id::bigint
    LEFT JOIN withdrawal_methods wm ON wm.id = wr.withdrawal_method_id::bigint
    WHERE wr.id = ${id}
      AND wr.delivery_man_id IS NOT NULL
      AND wr.vendor_id IS NULL
    LIMIT 1
  `;
  if (!rows.length) return null;
  return mapWithdrawRow(rows[0]!);
}

export async function updateDeliveryManWithdrawStatus(
  id: number,
  approved: 1 | 2,
  note: string | null | undefined,
  adminId: number | null
): Promise<{ ok: true } | { ok: false; msg: string; status?: number }> {
  const rows = await prisma.$queryRaw<
    Array<{
      id: bigint;
      delivery_man_id: unknown;
      amount: unknown;
      approved: number;
    }>
  >`
    SELECT id, delivery_man_id, amount, approved::int AS approved
    FROM withdraw_requests
    WHERE id = ${id}
      AND delivery_man_id IS NOT NULL
      AND vendor_id IS NULL
    LIMIT 1
  `;

  const wr = rows[0];
  if (!wr) return { ok: false, msg: 'Withdraw request not found', status: 404 };

  const prev = Number(wr.approved);
  if (prev !== 0) {
    return { ok: false, msg: 'Only pending withdraw requests can be updated', status: 400 };
  }

  const deliveryManId = Number(wr.delivery_man_id);
  const amount = roundMoney(decimalToNumber(wr.amount as never));
  if (!deliveryManId || amount <= 0) {
    return { ok: false, msg: 'Invalid withdraw request', status: 400 };
  }

  const wallet = await prisma.delivery_man_wallets.findFirst({
    where: { delivery_man_id: deliveryManId },
  });
  if (!wallet) return { ok: false, msg: 'Delivery man wallet not found', status: 404 };

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
      const w = await tx.delivery_man_wallets.findFirst({
        where: { delivery_man_id: deliveryManId },
      });
      if (!w) throw new Error('Wallet missing');

      if (approved === 1) {
        await tx.delivery_man_wallets.update({
          where: { id: w.id },
          data: {
            total_withdrawn: new Prisma.Decimal(Number(w.total_withdrawn) + amount),
            pending_withdraw: new Prisma.Decimal(Math.max(0, Number(w.pending_withdraw) - amount)),
            updated_at: now,
          },
        });
      } else {
        await tx.delivery_man_wallets.update({
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

  await notifyDeliveryManOfWithdrawDecision({
    deliveryManId,
    withdrawId: id,
    amount,
    approved,
  }).catch((e) => console.error('[notify] DM withdraw decision failed', e));

  return { ok: true };
}

export async function countPendingDeliveryManWithdraws(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ total: bigint }>>`
    SELECT COUNT(*)::bigint AS total
    FROM withdraw_requests
    WHERE delivery_man_id IS NOT NULL
      AND vendor_id IS NULL
      AND approved::int = 0
  `;
  return Number(rows[0]?.total ?? 0);
}
