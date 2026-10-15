import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';
import { syncParentDisbursementStatus } from './syncParentDisbursementStatus';

function walletMismatch(totalEarning: number, totalWithdrawn: number, pendingWithdraw: number): boolean {
  return totalEarning < totalWithdrawn + pendingWithdraw;
}

async function loadRestaurantWallet(vendorId: number) {
  return prisma.restaurant_wallets.findFirst({
    where: { vendor_id: vendorId },
  });
}

async function applyRestaurantDetailStatus(
  detailId: number,
  newStatus: 'pending' | 'completed' | 'canceled'
): Promise<string | null> {
  const detail = await prisma.disbursement_details.findUnique({
    where: { id: BigInt(detailId) },
  });
  if (!detail?.restaurant_id) return 'Disbursement detail not found';

  const restaurant = await prisma.restaurants.findUnique({
    where: { id: BigInt(Number(detail.restaurant_id)) },
    select: { id: true, name: true, vendor_id: true },
  });
  if (!restaurant?.vendor_id) return 'Restaurant not found';

  const vendorId = Number(restaurant.vendor_id);
  const wallet = await loadRestaurantWallet(vendorId);
  if (!wallet) return 'Restaurant wallet not found';

  const amount = Number(detail.disbursement_amount);
  const prev = detail.status ?? 'pending';
  if (prev === newStatus) return null;

  const te = Number(wallet.total_earning);
  const tw = Number(wallet.total_withdrawn);
  const pw = Number(wallet.pending_withdraw);

  if (walletMismatch(te, tw, pw)) {
    return `Balance mismatched — total earning is too low for ${restaurant.name ?? 'restaurant'}`;
  }

  const withdrawMethod = await prisma.disbursement_withdrawal_methods.findUnique({
    where: { id: BigInt(Number(detail.payment_method)) },
  });

  await prisma.$transaction(async (tx) => {
    const w = await tx.restaurant_wallets.findFirst({ where: { vendor_id: vendorId } });
    if (!w) throw new Error('Wallet missing');

    if (newStatus === 'completed') {
      if (prev !== 'completed') {
        const now = new Date();
        await tx.withdraw_requests.create({
          data: {
            vendor_id: vendorId,
            amount: amount,
            withdrawal_method_id: withdrawMethod?.withdrawal_method_id ?? null,
            withdrawal_method_fields: withdrawMethod?.method_fields ?? null,
            approved: true,
            transaction_note: String(detailId),
            type: 'disbursement',
            created_at: now,
            updated_at: now,
          },
        });

        if (prev === 'canceled') {
          await tx.restaurant_wallets.update({
            where: { id: w.id },
            data: {
              total_withdrawn: new Prisma.Decimal(Number(w.total_withdrawn) + amount),
              updated_at: now,
            },
          });
        } else {
          await tx.restaurant_wallets.update({
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
      await tx.restaurant_wallets.update({
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
        await tx.withdraw_requests.deleteMany({
          where: { vendor_id: vendorId, transaction_note: String(detailId), type: 'disbursement' },
        });
        await tx.restaurant_wallets.update({
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

export async function updateRestaurantDisbursementDetailStatus(
  detailId: number,
  status: 'pending' | 'completed' | 'canceled'
): Promise<{ ok: true } | { ok: false; msg: string }> {
  try {
    const err = await applyRestaurantDetailStatus(detailId, status);
    if (err) return { ok: false, msg: err };
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Status update failed';
    return { ok: false, msg };
  }
}

export async function bulkUpdateRestaurantDisbursementStatus(
  disbursementId: number,
  restaurantIds: number[],
  status: 'pending' | 'completed' | 'canceled'
): Promise<{ ok: true } | { ok: false; msg: string }> {
  const details = await prisma.disbursement_details.findMany({
    where: {
      disbursement_id: disbursementId,
      restaurant_id: { in: restaurantIds.map((id) => id) },
    },
  });
  for (const d of details) {
    const result = await updateRestaurantDisbursementDetailStatus(Number(d.id), status);
    if (!result.ok) return result;
  }
  return { ok: true };
}
