/**
 * End-to-end payment tests without the mobile apps:
 *   1) Consumer wallet checkout → demo driver → deliver → commission + wallets
 *   2) Vendor “Request Gizra driver” (manual dispatch) → driver accept → deliver
 *
 * Prereq: npm run seed:demo-checkout && npm run seed:business-settings (once)
 *
 *   npm run test:commission-flow              # wallet quote only
 *   npm run test:commission-flow -- --apply   # both flows against your DATABASE_URL
 */
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { Prisma } from '@prisma/client';
import prisma from '../src/config/database';
import { executePlaceOrder } from '../src/controllers/consumer/placeOrderLogic';
import {
  createOrderTransactionIfNeeded,
  ORDER_SETTLEMENT_TX_OPTIONS,
} from '../src/utils/order/createOrderTransaction';
import { roundMoney, decimalToNumber } from '../src/utils/vendor/walletHelpers';
import {
  readManualDispatch,
  writeManualDispatch,
} from '../src/utils/vendor/restaurantSetup/manualDispatch';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const apply = process.argv.includes('--apply');
const walletOnly = process.argv.includes('--wallet-only');

const DEMO = {
  consumerEmail: 'consumer@gizra.test',
  vendorEmail: 'vendor@gizra.test',
  driverPhone: '+972501000003',
  restaurantId: 16,
} as const;

async function upsertBusinessSetting(key: string, value: string): Promise<void> {
  const existing = await prisma.business_settings.findFirst({ where: { key } });
  const now = new Date();
  if (existing) {
    await prisma.business_settings.update({
      where: { id: existing.id },
      data: { value, updated_at: now },
    });
    return;
  }
  await prisma.business_settings.create({
    data: { key, value, created_at: now, updated_at: now },
  });
}

/** seed:business-settings leaves wallet off; turn it on for automated wallet checkout. */
async function ensureTestPaymentAndDispatchFlags(restaurantId: number): Promise<void> {
  await upsertBusinessSetting('wallet_status', '1');
  await readManualDispatch(BigInt(restaurantId));
  await writeManualDispatch(BigInt(restaurantId), true);
}

async function deliverOrder(orderId: bigint, driverId: bigint): Promise<void> {
  const order = await prisma.orders.findUniqueOrThrow({ where: { id: orderId } });
  const receivedBy = order.payment_method === 'cash_on_delivery' ? 'restaurant' : 'admin';
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.orders.update({
      where: { id: orderId },
      data: {
        delivery_man_id: new Prisma.Decimal(driverId.toString()),
        updated_at: now,
      },
    });
    await tx.delivery_men.update({
      where: { id: driverId },
      data: {
        current_orders: { increment: 1 },
        assigned_order_count: { increment: 1 },
        updated_at: now,
      },
    });

    const settled = await createOrderTransactionIfNeeded(tx, orderId, receivedBy);
    if (!settled) throw new Error('Settlement failed — check driver + restaurant delivery settings');

    await tx.orders.update({
      where: { id: orderId },
      data: {
        order_status: 'delivered',
        payment_status: 'paid',
        confirmed: now,
        processing: now,
        picked_up: now,
        delivered: now,
        updated_at: now,
      },
    });
    await tx.restaurants.update({
      where: { id: BigInt(Number(order.restaurant_id)) },
      data: { order_count: { increment: 1 }, updated_at: now },
    });
  }, ORDER_SETTLEMENT_TX_OPTIONS);
}

async function runManualDispatchFlow(params: {
  restaurantId: number;
  driverId: bigint;
  zoneId: number | null;
  lat: string | null;
  lng: string | null;
}): Promise<bigint> {
  const { restaurantId, driverId, zoneId, lat, lng } = params;
  const itemPrice = 149;
  const deliveryFee = 10;
  const taxPct = 10;
  const taxAmount = roundMoney(itemPrice * (taxPct / 100));
  const orderTotal = roundMoney(itemPrice + deliveryFee + taxAmount);
  const now = new Date();
  const idempotencyKey = `test-dispatch-${crypto.randomUUID()}`;

  const walkInEmail = `walkin+restaurant${restaurantId}@gizra.app`;
  let customer = await prisma.users.findFirst({ where: { email: walkInEmail } });
  if (!customer) {
    customer = await prisma.users.create({
      data: {
        email: walkInEmail,
        f_name: 'Walk-in',
        l_name: 'Customer',
        phone: `+00000000${String(restaurantId).padStart(3, '0').slice(-3)}`,
        password: 'unused',
        status: true,
        created_at: now,
        updated_at: now,
      },
    });
  }

  const order = await prisma.orders.create({
    data: {
      user_id: new Prisma.Decimal(Number(customer.id)),
      restaurant_id: new Prisma.Decimal(restaurantId),
      order_type: 'delivery',
      order_status: 'confirmed',
      pending: now,
      confirmed: now,
      accepted: now,
      schedule_at: now,
      order_amount: orderTotal,
      delivery_charge: deliveryFee,
      original_delivery_charge: deliveryFee,
      total_tax_amount: taxAmount,
      restaurant_discount_amount: 0,
      coupon_discount_amount: 0,
      dm_tips: 0,
      extra_packaging_amount: 0,
      additional_charge: 0,
      ref_bonus_amount: 0,
      payment_method: 'cash_on_delivery',
      payment_status: 'paid',
      zone_id: zoneId ?? undefined,
      delivery_address: JSON.stringify({
        contact_person_name: 'Phone order',
        contact_person_number: '+972501000099',
        address: 'Manual dispatch test address',
        address_type: 'others',
        latitude: String(lat ?? ''),
        longitude: String(lng ?? ''),
      }),
      is_manual_dispatch: true,
      manual_dispatch_key: idempotencyKey,
      order_note: 'Automated manual dispatch test',
      checked: false,
      created_at: now,
      updated_at: now,
    },
  });

  console.log(
    `\n=== Manual dispatch (Request Gizra driver) ===\n  Created order #${order.id} total=${orderTotal} (food ${itemPrice} + tax ${taxAmount} + delivery ${deliveryFee})`
  );

  await prisma.$transaction(async (tx) => {
    await tx.orders.update({
      where: { id: order.id },
      data: {
        delivery_man_id: new Prisma.Decimal(driverId.toString()),
        order_status: 'accepted',
        accepted: now,
        updated_at: now,
      },
    });
    await tx.delivery_men.update({
      where: { id: driverId },
      data: {
        current_orders: { increment: 1 },
        assigned_order_count: { increment: 1 },
        updated_at: now,
      },
    });
  }, ORDER_SETTLEMENT_TX_OPTIONS);
  console.log(`  Driver #${driverId} accepted (pool accept).`);

  const handoverAt = new Date();
  await prisma.orders.update({
    where: { id: order.id },
    data: { order_status: 'handover', handover: handoverAt, processing: handoverAt, updated_at: handoverAt },
  });

  await prisma.$transaction(async (tx) => {
    await tx.orders.update({
      where: { id: order.id },
      data: {
        order_status: 'picked_up',
        picked_up: new Date(),
        updated_at: new Date(),
      },
    });
  }, ORDER_SETTLEMENT_TX_OPTIONS);
  console.log('  Marked handover → picked_up.');

  await prisma.$transaction(async (tx) => {
    const settled = await createOrderTransactionIfNeeded(tx, order.id);
    if (!settled) throw new Error('Manual dispatch settlement failed');

    await tx.orders.update({
      where: { id: order.id },
      data: {
        order_status: 'delivered',
        delivered: new Date(),
        payment_status: 'paid',
        updated_at: new Date(),
      },
    });
    await tx.restaurants.update({
      where: { id: BigInt(restaurantId) },
      data: { order_count: { increment: 1 }, updated_at: new Date() },
    });
    const dm = await tx.delivery_men.findUnique({ where: { id: driverId } });
    if (dm) {
      const nextCurrent = Number(dm.current_orders) > 1 ? Number(dm.current_orders) - 1 : 0;
      await tx.delivery_men.update({
        where: { id: driverId },
        data: { current_orders: nextCurrent, order_count: { increment: 1 }, updated_at: new Date() },
      });
    }
  }, ORDER_SETTLEMENT_TX_OPTIONS);
  console.log('  Delivered + settlement row created.');

  return order.id;
}

async function printSummary(orderId: bigint, vendorId: number, label = ''): Promise<void> {
  const tx = await prisma.order_transactions.findFirst({
    where: { order_id: new Prisma.Decimal(orderId.toString()) },
  });
  const order = await prisma.orders.findUnique({ where: { id: orderId } });
  const wallet = await prisma.restaurant_wallets.findFirst({ where: { vendor_id: vendorId } });
  const adminWallet = await prisma.admin_wallets.findFirst();

  if (label) console.log(`\n--- ${label} ---`);
  console.log('\n--- Order ---');
  console.log(
    order
      ? `  id=${order.id} amount=${order.order_amount} tax=${order.total_tax_amount} delivery=${order.delivery_charge} tips=${order.dm_tips} status=${order.order_status}`
      : '  missing'
  );

  console.log('\n--- Settlement (dashboard uses these) ---');
  if (tx) {
    console.log(`  restaurant_amount (vendor earning): ${tx.restaurant_amount}`);
    console.log(`  admin_commission:                 ${tx.admin_commission}`);
    console.log(`  commission_percentage:            ${tx.commission_percentage}`);
    console.log(`  received_by:                      ${tx.received_by}`);
  } else {
    console.log('  (no order_transactions row)');
  }

  console.log('\n--- Vendor wallet ---');
  if (wallet) {
    console.log(`  total_earning:  ${wallet.total_earning}`);
    console.log(`  collected_cash: ${wallet.collected_cash}`);
  }

  console.log('\n--- Admin wallet ---');
  if (adminWallet) {
    console.log(`  total_commission_earning: ${adminWallet.total_commission_earning}`);
  }
}

async function main(): Promise<void> {
  const consumer = await prisma.users.findFirst({ where: { email: DEMO.consumerEmail } });
  const vendor = await prisma.vendors.findFirst({ where: { email: DEMO.vendorEmail } });
  const restaurant = await prisma.restaurants.findFirst({
    where: { id: BigInt(DEMO.restaurantId) },
  });
  const driver = await prisma.delivery_men.findFirst({ where: { phone: DEMO.driverPhone } });
  const food = await prisma.food.findFirst({
    where: { restaurant_id: DEMO.restaurantId, status: true },
    orderBy: { id: 'asc' },
  });
  const address = consumer
    ? await prisma.customer_addresses.findFirst({
        where: { user_id: Number(consumer.id) },
        orderBy: { id: 'desc' },
      })
    : null;

  if (!consumer || !vendor || !restaurant || !driver || !food || !address) {
    console.error('Missing demo data. Run: npm run seed:demo-checkout && npm run seed:business-settings');
    process.exit(1);
  }

  await ensureTestPaymentAndDispatchFlags(DEMO.restaurantId);

  const userId = Number(consumer.id);

  const minTestWallet = 500;
  const consumerBalance = decimalToNumber(
    (await prisma.users.findUnique({ where: { id: BigInt(userId) } }))?.wallet_balance
  );
  if (consumerBalance < minTestWallet) {
    await prisma.users.update({
      where: { id: BigInt(userId) },
      data: {
        wallet_balance: new Prisma.Decimal(minTestWallet.toFixed(3)),
        updated_at: new Date(),
      },
    });
    console.log(`Ensured consumer wallet ≥ ₪${minTestWallet} for test quotes.`);
  }
  const vendorId = Number(restaurant.vendor_id);
  const qty = 3;
  const dmTips = 10;

  const payload = {
    restaurant_id: DEMO.restaurantId,
    payment_method: 'wallet' as const,
    order_type: 'delivery' as const,
    delivery_address_id: Number(address.id),
    distance: 2,
    dm_tips: dmTips,
    is_buy_now: true,
    items: [
      {
        item_id: Number(food.id),
        item_type: 'Food' as const,
        quantity: qty,
        add_on_ids: [],
        add_on_qtys: [],
        variations: [],
      },
    ],
  };

  const userRow = await prisma.users.findUnique({ where: { id: BigInt(userId) } });

  const quote = await executePlaceOrder({
    payload,
    userId,
    isGuest: false,
    user: userRow ?? undefined,
    dryRun: true,
  });

  console.log(apply ? 'APPLY — full flow' : 'DRY RUN — quote only');
  console.log(`  Restaurant #${DEMO.restaurantId} (${restaurant.name}), commission ${restaurant.comission}%`);
  console.log(`  Item: ${food.name} x${qty} @ ${food.price}`);
  console.log(`  Quoted subtotal: ${quote.subtotal}, tax+: ${quote.taxAdded}, delivery: ${quote.delivery_charge}`);
  console.log(`  Quoted order total: ${quote.orderAmount}`);

  if (!apply) {
    console.log('\nRun: npm run test:commission-flow -- --apply');
    return;
  }

  const walletNeeded = roundMoney(Number(quote.orderAmount));
  const balance = decimalToNumber(userRow?.wallet_balance);
  if (balance < walletNeeded) {
    await prisma.users.update({
      where: { id: BigInt(userId) },
      data: {
        wallet_balance: new Prisma.Decimal((balance + walletNeeded + 100).toFixed(3)),
        updated_at: new Date(),
      },
    });
    console.log(`  Topped up consumer wallet for test (+${walletNeeded + 100})`);
  }

  const placed = await executePlaceOrder({
    payload,
    userId,
    isGuest: false,
    user: (await prisma.users.findUnique({ where: { id: BigInt(userId) } })) ?? undefined,
    dryRun: false,
  });

  const orderId = placed.order!.id;
  console.log(`\nPlaced order #${orderId} (wallet paid, pending → delivering…)`);

  await deliverOrder(orderId, driver.id);
  console.log(`Assigned driver #${driver.id} (${DEMO.driverPhone}) and marked delivered.`);

  await printSummary(orderId, vendorId, 'Wallet checkout flow');

  if (!walletOnly) {
    const dispatchOrderId = await runManualDispatchFlow({
      restaurantId: DEMO.restaurantId,
      driverId: driver.id,
      zoneId: restaurant.zone_id != null ? Number(restaurant.zone_id) : null,
      lat: restaurant.latitude,
      lng: restaurant.longitude,
    });
    await printSummary(dispatchOrderId, vendorId, 'Manual dispatch (Request Gizra driver)');
  }

  console.log('\nOpen vendor dashboard as vendor@gizra.test / password (hard refresh).');
  console.log('Wallet stays enabled in business_settings (was off in seed); revert if you need seed defaults.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
