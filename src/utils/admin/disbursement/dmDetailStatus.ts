import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';
import { syncParentDisbursementStatus } from './syncParentDisbursementStatus';

function walletMismatch(totalEarning: number, totalWithdrawn: number, pendingWithdraw: number): boolean {
  return totalEarning < totalWithdrawn + pendingWithdraw;
}

async function applyDmDetailStatus(
  detailId: number,
  newStatus: 'pending' | 'completed' | 'canceled'
): Promise<string | null> {
  const detail = await prisma.disbursement_details.findUnique({
    where: { id: BigInt(detailId) },
  });
  if (!detail?.delivery_man_id) return 'Disbursement detail not found';

  const dm = await prisma.delivery_men.findUnique({
    where: { id: BigInt(Number(detail.delivery_man_id)) },
    select: { id: true, f_name: true, l_name: true },
  });
  if (!dm) return 'Delivery man not found';

  const wallet = await prisma.delivery_man_wallets.findFirst({
    where: { delivery_man_id: Number(detail.delivery_man_id) },
  });
  if (!wallet) return 'Delivery man wallet not found';

  const amount = Number(detail.disbursement_amount);
  const prev = detail.status ?? 'pending';
  if (prev === newStatus) return null;

  const te = Number(wallet.total_earning);
  const tw = Number(wallet.total_withdrawn);
  const pw = Number(wallet.pending_withdraw);
  const dmName = [dm.f_name, dm.l_name].filter(Boolean).join(' ') || 'delivery man';

  if (walletMismatch(te, tw, pw)) {
    return `Balance mismatched — total earning is too low for ${dmName}`;
  }

  const withdrawMethod = await prisma.disbursement_withdrawal_methods.findUnique({
    where: { id: BigInt(Number(detail.payment_method)) },
  });

  await prisma.$transaction(async (tx) => {
    const w = await tx.delivery_man_wallets.findFirst({
      where: { delivery_man_id: Number(detail.delivery_man_id) },
    });
    if (!w) throw new Error('Wallet missing');

    if (newStatus === 'completed') {
      if (prev !== 'completed') {
        const now = new Date();
        await tx.provide_d_m_earnings.create({
          data: {
            delivery_man_id: Number(detail.delivery_man_id),
            method: withdrawMethod?.method_name ?? null,
            ref: String(detailId),
            amount,
            created_at: now,
            updated_at: now,
          },
        });

        if (prev === 'canceled') {
          await tx.delivery_man_wallets.update({
            where: { id: w.id },
            data: {
              total_withdrawn: new Prisma.Decimal(Number(w.total_withdrawn) + amount),
              updated_at: now,
            },
          });
        } else {
          await tx.delivery_man_wallets.update({
            where: { id: w.id },
            data: {
              pending_withdraw: new Prisma.Decimal(Math.max(0, Number(w.pending_withdraw) - amount)),
              total_withdrawn: new Prisma.Decimal(Number(w.total_withdrawn) + amount),
              updated_at: now,
            },
          });
        }
      }
    } else if (newStatus === 'canceled') {
      if (prev === 'completed') {
        throw new Error('Cannot cancel completed disbursement');
      }
      await tx.delivery_man_wallets.update({
        where: { id: w.id },
        data: {
          pending_withdraw: new Prisma.Decimal(Math.max(0, Number(w.pending_withdraw) - amount)),
          updated_at: new Date(),
        },
      });
    } else if (newStatus === 'pending') {
      if (prev === 'canceled') {
        throw new Error('Cannot revert canceled disbursement to pending');
      }
      if (prev === 'completed') {
        await tx.provide_d_m_earnings.deleteMany({
          where: { delivery_man_id: Number(detail.delivery_man_id), ref: String(detailId) },
        });
        await tx.delivery_man_wallets.update({
          where: { id: w.id },
          data: {
            total_withdrawn: new Prisma.Decimal(Math.max(0, Number(w.total_withdrawn) - amount)),
            pending_withdraw: new Prisma.Decimal(Number(w.pending_withdraw) + amount),
            updated_at: new Date(),
          },
        });
      }
    }

    await tx.disbursement_details.update({
      where: { id: BigInt(detailId) },
      data: { status: newStatus, updated_at: new Date() },
    });
  });

  await syncParentDisbursementStatus(Number(detail.disbursement_id));
  return null;
}

export async function updateDmDisbursementDetailStatus(
  detailId: number,
  status: 'pending' | 'completed' | 'canceled'
): Promise<{ ok: true } | { ok: false; msg: string }> {
  try {
    const err = await applyDmDetailStatus(detailId, status);
    if (err) return { ok: false, msg: err };
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Status update failed';
    return { ok: false, msg };
  }
}

export async function bulkUpdateDmDisbursementStatus(
  disbursementId: number,
  deliveryManIds: number[],
  status: 'pending' | 'completed' | 'canceled'
): Promise<{ ok: true } | { ok: false; msg: string }> {
  const details = await prisma.disbursement_details.findMany({
    where: {
      disbursement_id: disbursementId,
      delivery_man_id: { in: deliveryManIds.map((id) => id) },
    },
  });
  for (const d of details) {
    const result = await updateDmDisbursementDetailStatus(Number(d.id), status);
    if (!result.ok) return result;
  }
  return { ok: true };
}
