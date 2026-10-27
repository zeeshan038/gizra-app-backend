import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';
import { getBusinessSetting } from '../../consumer/businessSettings';
import { decimalToNumber, roundMoney, toDecimal } from '../../vendor/walletHelpers';

function dec(value: number | string | bigint): Prisma.Decimal {
  return new Prisma.Decimal(value.toString());
}

function disbursementAmount(wallet: {
  total_earning: unknown;
  total_withdrawn: unknown;
  pending_withdraw: unknown;
  collected_cash: unknown;
}): number {
  const totalEarning = decimalToNumber(wallet.total_earning as any);
  const totalWithdraw =
    decimalToNumber(wallet.total_withdrawn as any) + decimalToNumber(wallet.pending_withdraw as any);
  const cash = decimalToNumber(wallet.collected_cash as any);
  if (totalEarning > totalWithdraw + cash) {
    return roundMoney(totalEarning - totalWithdraw - cash);
  }
  return 0;
}

async function nextDisbursementId(tx: Prisma.TransactionClient): Promise<bigint> {
  const count = await tx.disbursements.count();
  let id = BigInt(1000 + count + 1);
  for (let i = 0; i < 50; i++) {
    const exists = await tx.disbursements.findUnique({ where: { id } });
    if (!exists) return id;
    id += BigInt(1);
  }
  const last = await tx.disbursements.findFirst({ orderBy: { id: 'desc' }, select: { id: true } });
  return (last?.id ?? BigInt(1000)) + BigInt(1);
}

/**
 * PHP RestaurantDisbursementController::generate_disbursement
 */
export async function generateRestaurantDisbursement() {
  const minRaw = await getBusinessSetting('restaurant_disbursement_min_amount');
  const minAmount = Number(minRaw ?? 0) || 0;

  const restaurants = await prisma.restaurants.findMany({
    select: { id: true, vendor_id: true },
  });

  const details: Array<{
    restaurant_id: number;
    amount: number;
    payment_method: number;
  }> = [];

  for (const restaurant of restaurants) {
    const wallet = await prisma.restaurant_wallets.findFirst({
      where: { vendor_id: restaurant.vendor_id },
    });
    if (!wallet) continue;

    const amount = disbursementAmount(wallet);
    if (!(amount > minAmount)) continue;

    const method = await prisma.disbursement_withdrawal_methods.findFirst({
      where: {
        restaurant_id: dec(restaurant.id),
        is_default: 1,
      },
      select: { id: true },
    });
    if (!method) continue;

    details.push({
      restaurant_id: Number(restaurant.id),
      amount,
      payment_method: Number(method.id),
    });
  }

  if (!details.length) {
    return { created: false, msg: 'No eligible restaurants for disbursement', data: null };
  }

  const totalAmount = roundMoney(details.reduce((sum, d) => sum + d.amount, 0));
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const id = await nextDisbursementId(tx);
    const title = `Disbursement # ${id}`;
    const batch = await tx.disbursements.create({
      data: {
        id,
        title,
        description: null,
        total_amount: totalAmount,
        status: 'pending',
        created_for: 'restaurant',
        created_at: now,
        updated_at: now,
      },
    });

    for (const detail of details) {
      await tx.disbursement_details.create({
        data: {
          disbursement_id: dec(batch.id),
          restaurant_id: dec(detail.restaurant_id),
          delivery_man_id: null,
          disbursement_amount: detail.amount,
          payment_method: dec(detail.payment_method),
          status: 'pending',
          created_at: now,
          updated_at: now,
        },
      });

      const restaurant = restaurants.find((r) => Number(r.id) === detail.restaurant_id);
      if (!restaurant) continue;
      const wallet = await tx.restaurant_wallets.findFirst({
        where: { vendor_id: restaurant.vendor_id },
      });
      if (!wallet) continue;
      await tx.restaurant_wallets.update({
        where: { id: wallet.id },
        data: {
          pending_withdraw: { increment: toDecimal(detail.amount) },
          updated_at: now,
        },
      });
    }

    return {
      id: Number(batch.id),
      title: batch.title,
      total_amount: totalAmount,
      details_count: details.length,
      status: batch.status,
    };
  });

  return { created: true, msg: 'Restaurant disbursement generated', data: result };
}

/**
 * PHP DeliveryManDisbursementController::generate_disbursement
 */
export async function generateDeliveryManDisbursement() {
  const minRaw = await getBusinessSetting('dm_disbursement_min_amount');
  const minAmount = Number(minRaw ?? 0) || 0;

  const deliveryMen = await prisma.delivery_men.findMany({
    where: { type: 'zone_wise', earning: true },
    select: { id: true },
  });

  const details: Array<{
    delivery_man_id: number;
    amount: number;
    payment_method: number;
  }> = [];

  for (const dm of deliveryMen) {
    const wallet = await prisma.delivery_man_wallets.findFirst({
      where: { delivery_man_id: dec(dm.id) },
    });
    if (!wallet) continue;

    const amount = disbursementAmount(wallet);
    if (!(amount > minAmount)) continue;

    const method = await prisma.disbursement_withdrawal_methods.findFirst({
      where: {
        delivery_man_id: dec(dm.id),
        is_default: 1,
      },
      select: { id: true },
    });
    if (!method) continue;

    details.push({
      delivery_man_id: Number(dm.id),
      amount,
      payment_method: Number(method.id),
    });
  }

  if (!details.length) {
    return { created: false, msg: 'No eligible delivery men for disbursement', data: null };
  }

  const totalAmount = roundMoney(details.reduce((sum, d) => sum + d.amount, 0));
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const id = await nextDisbursementId(tx);
    const title = `Disbursement # ${id}`;
    const batch = await tx.disbursements.create({
      data: {
        id,
        title,
        description: null,
        total_amount: totalAmount,
        status: 'pending',
        created_for: 'delivery_man',
        created_at: now,
        updated_at: now,
      },
    });

    for (const detail of details) {
      await tx.disbursement_details.create({
        data: {
          disbursement_id: dec(batch.id),
          restaurant_id: null,
          delivery_man_id: dec(detail.delivery_man_id),
          disbursement_amount: detail.amount,
          payment_method: dec(detail.payment_method),
          status: 'pending',
          created_at: now,
          updated_at: now,
        },
      });

      const wallet = await tx.delivery_man_wallets.findFirst({
        where: { delivery_man_id: dec(detail.delivery_man_id) },
      });
      if (!wallet) continue;
      await tx.delivery_man_wallets.update({
        where: { id: wallet.id },
        data: {
          pending_withdraw: { increment: toDecimal(detail.amount) },
          updated_at: now,
        },
      });
    }

    return {
      id: Number(batch.id),
      title: batch.title,
      total_amount: totalAmount,
      details_count: details.length,
      status: batch.status,
    };
  });

  return { created: true, msg: 'Delivery man disbursement generated', data: result };
}
