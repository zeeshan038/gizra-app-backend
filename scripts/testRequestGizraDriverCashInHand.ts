/**
 * Request Gizra driver (manual dispatch) via HTTP + driver deliver → verify restaurant collected_cash.
 *
 * Prereq: npm run dev (port 3000), seed:demo-checkout, tunnel DB if needed.
 *
 *   npm run test:request-gizra-driver              # dry run (login + quote math only)
 *   npm run test:request-gizra-driver -- --apply
 */
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { Prisma } from '@prisma/client';
import prisma from '../src/config/database';
import {
  createOrderTransactionIfNeeded,
  ORDER_SETTLEMENT_TX_OPTIONS,
} from '../src/utils/order/createOrderTransaction';
import {
  computeRestaurantWalletBalance,
  decimalToNumber,
  roundMoney,
} from '../src/utils/vendor/walletHelpers';
import {
  readManualDispatch,
  writeManualDispatch,
} from '../src/utils/vendor/restaurantSetup/manualDispatch';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const apply = process.argv.includes('--apply');
const API_BASE = (process.env.TEST_API_BASE || 'http://localhost:3000/api').replace(/\/$/, '');

const DEMO = {
  vendorEmail: 'vendor@gizra.test',
  vendorPassword: 'password',
  driverPhone: '+972501000003',
  driverPassword: 'password',
  restaurantId: 16,
  itemPrice: 149,
  deliveryFee: 10,
  taxPct: 10,
} as const;

async function jsonFetch(
  url: string,
  init: RequestInit & { token?: string }
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  const res = await fetch(url, { ...init, headers });
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = { msg: await res.text() };
  }
  return { status: res.status, body };
}

async function ensureManualDispatchEnabled(restaurantId: number): Promise<void> {
  await readManualDispatch(BigInt(restaurantId));
  await writeManualDispatch(BigInt(restaurantId), true);
}

async function walletSnapshot(vendorId: number) {
  const wallet = await prisma.restaurant_wallets.findFirst({
    where: { vendor_id: vendorId },
  });
  const collected = decimalToNumber(wallet?.collected_cash);
  const totalEarning = decimalToNumber(wallet?.total_earning);
  const totalWithdrawn = decimalToNumber(wallet?.total_withdrawn);
  const pendingWithdraw = decimalToNumber(wallet?.pending_withdraw);
  return {
    collected_cash: collected,
    total_earning: totalEarning,
    withdrawable_balance: computeRestaurantWalletBalance({
      total_earning: totalEarning,
      total_withdrawn: totalWithdrawn,
      pending_withdraw: pendingWithdraw,
      collected_cash: collected,
    }),
  };
}

async function deliverAsDriver(orderId: bigint, driverId: bigint): Promise<void> {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.orders.update({
      where: { id: orderId },
      data: {
        delivery_man_id: new Prisma.Decimal(driverId.toString()),
        order_status: 'accepted',
        accepted: now,
        updated_at: now,
      },
    });
  }, ORDER_SETTLEMENT_TX_OPTIONS);

  await prisma.orders.update({
    where: { id: orderId },
    data: {
      order_status: 'handover',
      handover: now,
      processing: now,
      updated_at: now,
    },
  });

  await prisma.orders.update({
    where: { id: orderId },
    data: { order_status: 'picked_up', picked_up: now, updated_at: now },
  });

  await prisma.$transaction(async (tx) => {
    const settled = await createOrderTransactionIfNeeded(tx, orderId);
    if (!settled) throw new Error('Settlement failed on deliver');
    await tx.orders.update({
      where: { id: orderId },
      data: {
        order_status: 'delivered',
        delivered: now,
        payment_status: 'paid',
        updated_at: now,
      },
    });
    const order = await tx.orders.findUnique({ where: { id: orderId } });
    if (order) {
      await tx.restaurants.update({
        where: { id: BigInt(Number(order.restaurant_id)) },
        data: { order_count: { increment: 1 }, updated_at: now },
      });
    }
  }, ORDER_SETTLEMENT_TX_OPTIONS);
}

async function main(): Promise<void> {
  const restaurant = await prisma.restaurants.findUnique({
    where: { id: BigInt(DEMO.restaurantId) },
  });
  const vendor = await prisma.vendors.findFirst({ where: { email: DEMO.vendorEmail } });
  const driver = await prisma.delivery_men.findFirst({ where: { phone: DEMO.driverPhone } });

  if (!restaurant || !vendor || !driver) {
    console.error('Missing demo vendor/restaurant/driver. Run: npm run seed:demo-checkout');
    process.exit(1);
  }

  const vendorId = Number(restaurant.vendor_id);
  const taxAmount = roundMoney(DEMO.itemPrice * (DEMO.taxPct / 100));
  const orderTotal = roundMoney(DEMO.itemPrice + DEMO.deliveryFee + taxAmount);

  console.log('Request Gizra driver — cash in hand test');
  console.log(`  API: ${API_BASE}`);
  console.log(`  Restaurant #${DEMO.restaurantId}, food ₪${DEMO.itemPrice} + VAT ₪${taxAmount} + delivery ₪${DEMO.deliveryFee} = ₪${orderTotal}`);

  await ensureManualDispatchEnabled(DEMO.restaurantId);

  const before = await walletSnapshot(vendorId);
  console.log(`\n  Wallet BEFORE: collected_cash=₪${before.collected_cash}, total_earning=₪${before.total_earning}`);

  const login = await jsonFetch(`${API_BASE}/vendor/login`, {
    method: 'POST',
    body: JSON.stringify({ email: DEMO.vendorEmail, password: DEMO.vendorPassword }),
  });
  if (login.status !== 200 || login.body.status === false) {
    console.error('Vendor login failed. Is npm run dev running on port 3000?', login.body);
    process.exit(1);
  }
  const token = (login.body.data as { token?: string })?.token;
  if (!token) {
    console.error('No token in login response', login.body);
    process.exit(1);
  }
  console.log('  Vendor login OK');

  const idempotencyKey = `cash-test-${crypto.randomUUID()}`;
  const dispatchBody = {
    customer_name: 'Cash test',
    customer_phone: '+972501000099',
    address: 'Request Gizra driver test address',
    order_amount: DEMO.itemPrice,
    delivery_fee: DEMO.deliveryFee,
    payment_method: 'prepaid',
    idempotency_key: idempotencyKey,
    tax: DEMO.taxPct,
  };

  if (!apply) {
    console.log('\nDRY RUN — would POST /vendor/dispatch/request-driver then deliver.');
    console.log('  Expected collected_cash increase after deliver: ₪' + orderTotal);
    console.log('  (Restaurant keeps full order cash; commission owed to platform separately.)');
    console.log('\nRun: npm run test:request-gizra-driver -- --apply');
    return;
  }

  const dispatch = await jsonFetch(`${API_BASE}/vendor/dispatch/request-driver`, {
    method: 'POST',
    token,
    body: JSON.stringify(dispatchBody),
  });
  if (dispatch.status !== 200 || dispatch.body.status === false) {
    console.error('request-driver failed:', dispatch.body);
    process.exit(1);
  }

  const summary = dispatch.body.data as { order_id?: string; gizra_charge?: number; restaurant_net?: number };
  const orderId = BigInt(summary.order_id!);
  console.log(`\n  request-driver OK → order #${orderId}`);
  console.log(`  Dispatch summary gizra_charge=${summary.gizra_charge}, restaurant_net=${summary.restaurant_net}`);

  await deliverAsDriver(orderId, driver.id);
  console.log(`  Driver delivered order #${orderId}`);

  const after = await walletSnapshot(vendorId);
  const cashDelta = roundMoney(after.collected_cash - before.collected_cash);
  const earningDelta = roundMoney(after.total_earning - before.total_earning);

  const txRow = await prisma.order_transactions.findFirst({
    where: { order_id: new Prisma.Decimal(orderId.toString()) },
  });
  const cashLedger = await prisma.account_transactions.findFirst({
    where: { ref: orderId.toString(), method: 'cash_collection', from_type: 'restaurant' },
    orderBy: { id: 'desc' },
  });

  console.log('\n=== Cash in hand (restaurant wallet) ===');
  console.log(`  collected_cash BEFORE:  ₪${before.collected_cash}`);
  console.log(`  collected_cash AFTER:   ₪${after.collected_cash}`);
  console.log(`  INCREASE (cash in hand): ₪${cashDelta}  (expected ₪${orderTotal})`);
  console.log(`  total_earning increase:  ₪${earningDelta}`);
  console.log(`  withdrawable balance:    ₪${after.withdrawable_balance}`);
  console.log(`  settlement received_by:    ${txRow?.received_by ?? 'missing'}`);
  console.log(`  account_transactions cash: ₪${cashLedger ? decimalToNumber(cashLedger.amount) : 'none'}`);

  const ok = cashDelta === orderTotal && txRow?.received_by === 'restaurant';
  if (ok) {
    console.log('\nPASS — Restaurant collected full order amount as cash in hand.');
  } else {
    console.error('\nFAIL — Cash in hand does not match expected manual dispatch settlement.');
    process.exit(1);
  }

  const walletApi = await jsonFetch(`${API_BASE}/vendor/wallet`, { method: 'GET', token });
  if (walletApi.status === 200 && walletApi.body.data) {
    const w = walletApi.body.data as { collectedCash?: number; totalEarning?: number };
    console.log(`\nGET /vendor/wallet (panel): collectedCash=₪${w.collectedCash}, totalEarning=₪${w.totalEarning}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
