import {
  delivery_men,
  orders,
  Prisma,
  restaurant_subscriptions,
  restaurants,
} from '@prisma/client';

export class OrderSettlementError extends Error {
  constructor(message = 'Failed to create order transaction') {
    super(message);
    this.name = 'OrderSettlementError';
  }
}

type Tx = Prisma.TransactionClient;

function dec(value: number | string | bigint): Prisma.Decimal {
  return new Prisma.Decimal(value.toString());
}

function n(value: unknown): number {
  if (value == null) return 0;
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
}

async function loadBusinessSettings(
  tx: Tx,
  keys: string[]
): Promise<Map<string, string | null>> {
  const rows = await tx.business_settings.findMany({
    where: { key: { in: keys } },
    select: { key: true, value: true },
  });
  const map = new Map<string, string | null>();
  for (const key of keys) map.set(key, null);
  for (const row of rows) map.set(row.key, row.value);
  return map;
}

function settingFrom(map: Map<string, string | null>, key: string): string | null {
  return map.get(key) ?? null;
}

function isSelfDelivery(
  restaurant: restaurants,
  restSub: restaurant_subscriptions | null
): boolean {
  if (restaurant.restaurant_model === 'subscription' && restSub) {
    return restSub.self_delivery === true;
  }
  return restaurant.self_delivery_system === true;
}

function isPlatformDelivery(
  restaurant: restaurants,
  restSub: restaurant_subscriptions | null
): boolean {
  return !isSelfDelivery(restaurant, restSub);
}

function resolveReceivedBy(
  order: orders,
  dm: delivery_men,
  unpaidPaymentMethod: string | null | undefined
): 'admin' | 'restaurant' | 'deliveryman' {
  const isCod =
    order.payment_method === 'cash_on_delivery' ||
    unpaidPaymentMethod === 'cash_on_delivery';
  if (!isCod) return 'admin';
  return dm.type !== 'zone_wise' ? 'restaurant' : 'deliveryman';
}

/** PHP settlement + order status updates can exceed Prisma default 5s tx timeout. */
export const ORDER_SETTLEMENT_TX_OPTIONS = {
  maxWait: 15_000,
  timeout: 30_000,
} as const;

async function getOrCreateDmWallet(tx: Tx, deliveryManId: number) {
  const dmId = dec(deliveryManId);
  const existing = await tx.delivery_man_wallets.findFirst({
    where: { delivery_man_id: dmId },
  });
  if (existing) return existing;
  return tx.delivery_man_wallets.create({
    data: {
      delivery_man_id: dmId,
      created_at: new Date(),
      updated_at: new Date(),
    },
  });
}

async function getOrCreateVendorWallet(tx: Tx, vendorId: number) {
  const vid = dec(vendorId);
  const existing = await tx.restaurant_wallets.findFirst({
    where: { vendor_id: vid },
  });
  if (existing) return existing;
  return tx.restaurant_wallets.create({
    data: {
      vendor_id: vid,
      created_at: new Date(),
      updated_at: new Date(),
    },
  });
}

async function getOrCreateAdminWallet(tx: Tx) {
  const admin = await tx.admins.findFirst({
    where: { role_id: dec(1) },
    select: { id: true },
  });
  if (!admin) return null;
  const adminId = dec(admin.id);
  const existing = await tx.admin_wallets.findFirst({
    where: { admin_id: adminId },
  });
  if (existing) return existing;
  return tx.admin_wallets.create({
    data: {
      admin_id: adminId,
      created_at: new Date(),
      updated_at: new Date(),
    },
  });
}

async function recordCashCollection(
  tx: Tx,
  fromType: 'deliveryman' | 'restaurant',
  fromId: number,
  amount: number,
  orderId: bigint,
  currentBalance: number
) {
  if (amount <= 0) return;
  await tx.account_transactions.create({
    data: {
      from_type: fromType,
      from_id: dec(fromId),
      created_by: fromType,
      method: 'cash_collection',
      ref: orderId.toString(),
      amount: dec(amount),
      current_balance: dec(currentBalance),
      type: 'cash_in',
      created_at: new Date(),
      updated_at: new Date(),
    },
  });
}

/**
 * PHP OrderLogic::create_transaction — run once when order is delivered (before payment_status = paid).
 */
export async function createOrderTransactionIfNeeded(
  tx: Tx,
  orderId: bigint,
  receivedByOverride?: 'admin' | 'restaurant' | 'deliveryman' | false
): Promise<boolean> {
  const orderIdDec = dec(orderId);

  const existing = await tx.order_transactions.findFirst({
    where: { order_id: orderIdDec },
  });
  if (existing) {
    const order = await tx.orders.findUnique({ where: { id: orderId } });
    if (
      order?.delivery_man_id != null &&
      (existing.delivery_man_id == null || n(existing.delivery_man_id) === 0)
    ) {
      await tx.order_transactions.update({
        where: { id: existing.id },
        data: {
          delivery_man_id: order.delivery_man_id,
          updated_at: new Date(),
        },
      });
    }
    return true;
  }

  const order = await tx.orders.findUnique({ where: { id: orderId } });
  if (!order?.delivery_man_id) return false;

  const restaurantId = BigInt(n(order.restaurant_id));
  const dmId = BigInt(n(order.delivery_man_id));

  const [restaurant, dm, unpaid, settingsMap] = await Promise.all([
    tx.restaurants.findUnique({ where: { id: restaurantId } }),
    tx.delivery_men.findUnique({ where: { id: dmId } }),
    tx.order_payments.findFirst({
      where: { order_id: orderIdDec, payment_status: 'unpaid' },
    }),
    loadBusinessSettings(tx, [
      'admin_commission',
      'manual_dispatch_commission',
      'delivery_charge_comission',
    ]),
  ]);

  if (!restaurant || !dm) return false;

  const vendorId = n(restaurant.vendor_id);
  const restSub =
    restaurant.restaurant_model === 'subscription'
      ? await tx.restaurant_subscriptions.findFirst({
          where: {
            restaurant_id: dec(restaurant.id),
            status: true,
          },
        })
      : null;

  const adminCommissionSetting = settingFrom(settingsMap, 'admin_commission');
  const commissionRate =
    restaurant.comission != null ? n(restaurant.comission) : n(adminCommissionSetting);
  const unpaidPayMethod = unpaid?.payment_method ?? 'digital_payment';

  let admin_subsidy = 0;
  let restaurant_subsidy = 0;
  let admin_coupon_discount_subsidy = 0;
  let restaurant_coupon_discount_subsidy = 0;
  let restaurant_discount_amount = 0;
  let restaurant_d_amount = 0;
  let amount_admin = 0;
  const ref_bonus_amount = n(order.ref_bonus_amount);

  if (order.free_delivery_by === 'admin') {
    admin_subsidy = n(order.original_delivery_charge);
  }
  if (order.free_delivery_by === 'vendor') {
    restaurant_subsidy = n(order.original_delivery_charge);
  }
  if (order.coupon_created_by === 'admin') {
    admin_coupon_discount_subsidy = n(order.coupon_discount_amount);
  }
  if (order.coupon_created_by === 'vendor') {
    restaurant_coupon_discount_subsidy = n(order.coupon_discount_amount);
  }
  if (n(order.restaurant_discount_amount) > 0 && order.discount_on_product_by === 'vendor') {
    if (restaurant.restaurant_model === 'subscription' && restSub) {
      restaurant_d_amount = n(order.restaurant_discount_amount);
    } else {
      amount_admin = commissionRate
        ? (n(order.restaurant_discount_amount) / 100) * commissionRate
        : 0;
      restaurant_d_amount = n(order.restaurant_discount_amount) - amount_admin;
    }
  }
  if (n(order.restaurant_discount_amount) > 0 && order.discount_on_product_by === 'admin') {
    restaurant_discount_amount = n(order.restaurant_discount_amount);
  }

  const order_amount =
    n(order.order_amount) -
    n(order.additional_charge) -
    n(order.extra_packaging_amount) -
    n(order.delivery_charge) -
    n(order.total_tax_amount) -
    n(order.dm_tips) +
    n(order.coupon_discount_amount) +
    restaurant_discount_amount +
    ref_bonus_amount;

  let comission_amount = 0;
  let subscription_mode = 0;
  let commission_percentage = 0;
  let comission_on_delivery = 0;
  let comission_on_actual_delivery_fee = 0;
  let received_by: 'admin' | 'restaurant' | 'deliveryman' = 'admin';

  const original_delivery_charge =
    n(order.original_delivery_charge) || n(order.delivery_charge);

  if (order.is_manual_dispatch) {
    const rate = n(settingFrom(settingsMap, 'manual_dispatch_commission')) || 10;
    comission_amount = Math.round(order_amount * (rate / 100) * 100) / 100;
    commission_percentage = rate;
    received_by = order.payment_status === 'paid' ? 'restaurant' : 'deliveryman';
  } else {
    if (restaurant.restaurant_model === 'subscription' && restSub) {
      comission_amount = 0;
      subscription_mode = 1;
      commission_percentage = 0;
    } else {
      comission_amount = commissionRate ? (order_amount / 100) * commissionRate : 0;
      subscription_mode = 0;
      commission_percentage = commissionRate;
    }

    if (isSelfDelivery(restaurant, restSub)) {
      comission_on_delivery = 0;
      comission_on_actual_delivery_fee = 0;
    } else {
      const deliveryCommissionPct = n(settingFrom(settingsMap, 'delivery_charge_comission'));
      comission_on_delivery = deliveryCommissionPct * (original_delivery_charge / 100);
      comission_on_actual_delivery_fee =
        n(order.delivery_charge) > 0 ? comission_on_delivery : 0;
    }

    received_by = resolveReceivedBy(order, dm, unpaid?.payment_method);
  }

  if (receivedByOverride) {
    received_by = receivedByOverride;
  }

  const restaurant_amount =
    order_amount +
    n(order.total_tax_amount) +
    n(order.extra_packaging_amount) -
    comission_amount -
    restaurant_coupon_discount_subsidy;

  const now = new Date();
  const collectAmount = n(order.order_amount) - n(order.partially_paid_amount);

  await tx.order_transactions.create({
    data: {
      vendor_id: dec(vendorId),
      delivery_man_id: order.delivery_man_id,
      order_id: orderIdDec,
      order_amount: dec(n(order.order_amount)),
      restaurant_amount: dec(restaurant_amount),
      admin_commission: dec(
        comission_amount +
          n(order.additional_charge) -
          admin_subsidy -
          admin_coupon_discount_subsidy -
          ref_bonus_amount -
          restaurant_discount_amount
      ),
      delivery_charge: dec(n(order.delivery_charge) - comission_on_actual_delivery_fee),
      original_delivery_charge: dec(original_delivery_charge - comission_on_delivery),
      tax: dec(n(order.total_tax_amount)),
      received_by,
      zone_id: order.zone_id,
      status: null,
      dm_tips: n(order.dm_tips),
      created_at: now,
      updated_at: now,
      delivery_fee_comission: comission_on_actual_delivery_fee,
      admin_expense:
        admin_subsidy +
        admin_coupon_discount_subsidy +
        restaurant_discount_amount +
        amount_admin +
        ref_bonus_amount,
      restaurant_expense: restaurant_subsidy + restaurant_coupon_discount_subsidy,
      is_subscribed: subscription_mode === 1,
      commission_percentage,
      discount_amount_by_restaurant:
        restaurant_coupon_discount_subsidy + restaurant_d_amount + restaurant_subsidy,
      is_subscription: order.subscription_id != null,
      additional_charge: n(order.additional_charge),
      extra_packaging_amount: n(order.extra_packaging_amount),
      ref_bonus_amount,
    },
  });

  const [adminWallet, vendorWallet] = await Promise.all([
    getOrCreateAdminWallet(tx),
    getOrCreateVendorWallet(tx, vendorId),
  ]);

  const platformDelivery = isPlatformDelivery(restaurant, restSub);
  let dmWallet = null as Awaited<ReturnType<typeof getOrCreateDmWallet>> | null;

  const dmEarningIncrement =
    n(order.dm_tips) + original_delivery_charge - comission_on_delivery;

  let adminCommissionIncrement =
    comission_amount +
    comission_on_actual_delivery_fee -
    admin_subsidy -
    admin_coupon_discount_subsidy -
    restaurant_discount_amount +
    n(order.additional_charge) -
    ref_bonus_amount;

  if (platformDelivery && !dm.earning) {
    adminCommissionIncrement += dmEarningIncrement;
  }

  let adminDeliveryChargeIncrement = 0;
  if (!isSelfDelivery(restaurant, restSub)) {
    adminDeliveryChargeIncrement =
      n(order.delivery_charge) - comission_on_actual_delivery_fee;
  }

  const adminDigitalIncrement = adminWallet && received_by === 'admin' ? collectAmount : 0;

  if (platformDelivery && dm.earning) {
    dmWallet = await getOrCreateDmWallet(tx, n(order.delivery_man_id));
    await tx.delivery_man_wallets.update({
      where: { id: dmWallet.id },
      data: {
        total_earning: { increment: dec(dmEarningIncrement) },
        updated_at: now,
      },
    });
  }

  if (adminWallet) {
    await tx.admin_wallets.update({
      where: { id: adminWallet.id },
      data: {
        total_commission_earning: { increment: dec(adminCommissionIncrement) },
        delivery_charge: { increment: dec(adminDeliveryChargeIncrement) },
        digital_received: { increment: dec(adminDigitalIncrement) },
        updated_at: now,
      },
    });
  }

  const vendorEarningIncrement = isSelfDelivery(restaurant, restSub)
    ? n(order.delivery_charge) + n(order.dm_tips) + restaurant_amount
    : restaurant_amount;

  if (
    received_by === 'restaurant' &&
    (order.payment_method === 'cash_on_delivery' || unpaidPayMethod === 'cash_on_delivery')
  ) {
    const before = n(vendorWallet.collected_cash);
    await tx.restaurant_wallets.update({
      where: { id: vendorWallet.id },
      data: {
        total_earning: { increment: dec(vendorEarningIncrement) },
        collected_cash: { increment: dec(collectAmount) },
        updated_at: now,
      },
    });
    await recordCashCollection(tx, 'restaurant', vendorId, collectAmount, orderId, before);
  } else if (
    received_by === 'deliveryman' &&
    dm.type === 'zone_wise' &&
    (order.payment_method === 'cash_on_delivery' || unpaidPayMethod === 'cash_on_delivery')
  ) {
    if (!dmWallet) {
      dmWallet = await getOrCreateDmWallet(tx, n(order.delivery_man_id));
    }
    const before = n(dmWallet.collected_cash);
    await tx.delivery_man_wallets.update({
      where: { id: dmWallet.id },
      data: {
        collected_cash: { increment: dec(collectAmount) },
        updated_at: now,
      },
    });
    await recordCashCollection(tx, 'deliveryman', n(order.delivery_man_id), collectAmount, orderId, before);
    await tx.restaurant_wallets.update({
      where: { id: vendorWallet.id },
      data: {
        total_earning: { increment: dec(vendorEarningIncrement) },
        updated_at: now,
      },
    });
  } else {
    await tx.restaurant_wallets.update({
      where: { id: vendorWallet.id },
      data: {
        total_earning: { increment: dec(vendorEarningIncrement) },
        updated_at: now,
      },
    });
  }

  await tx.order_payments.updateMany({
    where: { order_id: orderIdDec, payment_status: 'unpaid' },
    data: { payment_status: 'paid', updated_at: now },
  });

  return true;
}
