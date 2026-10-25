/**
 * Clear orders, commissions, wallet, withdraw requests, and related financial rows
 * for ONE vendor (by email). Keeps vendor, restaurant(s), menu, and customers.
 *
 * Usage (Mac — tunnel: ./scripts/mac-db-tunnel.sh in another terminal):
 *   npm run db:clear-vendor-transactions
 *   npm run db:clear-vendor-transactions -- --email=wondertripai@gmail.com
 *   npm run db:clear-vendor-transactions -- --email=wondertripai@gmail.com --apply
 *
 * Options:
 *   --apply              Execute deletes (default is dry run)
 *   --keep-orders        Remove transactions/wallet/withdrawals only; reset paid orders to unpaid for re-settlement
 *   --adjust-admin-wallet  Subtract deleted order_transactions admin_commission from admin_wallets (use with --apply)
 */
import dotenv from 'dotenv';
import path from 'path';
import { Prisma } from '@prisma/client';
import prisma from '../src/config/database';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const EMAIL = arg('email', 'wondertripai@gmail.com').trim().toLowerCase();
const apply = process.argv.includes('--apply');
const keepOrders = process.argv.includes('--keep-orders');
const adjustAdminWallet = process.argv.includes('--adjust-admin-wallet');

const zeroMoney = new Prisma.Decimal('0.00');

function dec(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n);
}

/** `payment_requests.attribute_id` is varchar — must not compare to bare integers. */
async function deletePaymentRequestsForOrders(orderIds: number[]): Promise<number> {
  if (!orderIds.length) return 0;
  const idParams = orderIds.map((id) => String(id));
  return prisma.$executeRaw`
    DELETE FROM payment_requests
    WHERE attribute = 'order'
      AND attribute_id IN (${Prisma.join(idParams)})
  `;
}

async function resolveVendor(email: string) {
  const vendor = await prisma.vendors.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  });
  if (!vendor) {
    throw new Error(`Vendor not found for email: ${email}`);
  }

  const restaurants = await prisma.restaurants.findMany({
    where: { vendor_id: Number(vendor.id) },
    orderBy: { id: 'asc' },
  });
  if (!restaurants.length) {
    throw new Error(`No restaurant for vendor ${email} (vendor id=${vendor.id})`);
  }

  return { vendor, restaurants };
}

async function sumVendorOrderTransactions(vendorId: number) {
  const vid = dec(vendorId);
  const agg = await prisma.order_transactions.aggregate({
    where: { vendor_id: vid },
    _sum: {
      admin_commission: true,
      restaurant_amount: true,
      order_amount: true,
    },
    _count: true,
  });
  return agg;
}

const VENDOR_CLEAR_LOCK_KEY = 783451;

async function withVendorClearLock<T>(run: () => Promise<T>): Promise<T> {
  const locked = await prisma.$queryRaw<[{ locked: boolean }]>`
    SELECT pg_try_advisory_lock(${VENDOR_CLEAR_LOCK_KEY}) AS locked
  `;
  if (!locked[0]?.locked) {
    throw new Error(
      'Another vendor clear script is already running (or a previous run crashed — retry in a minute). Stop duplicate terminals.'
    );
  }
  try {
    return await run();
  } finally {
    await prisma.$executeRaw`SELECT pg_advisory_unlock(${VENDOR_CLEAR_LOCK_KEY})`;
  }
} 

async function deleteOrderRelationsBulk(tx: Prisma.TransactionClient, orderIds: number[]): Promise<void> {
  if (!orderIds.length) return;
  const orderIdFilter = { order_id: { in: orderIds.map(dec) } };
  await Promise.all([
    tx.order_details.deleteMany({ where: orderIdFilter }),
    tx.order_payments.deleteMany({ where: orderIdFilter }),
    tx.order_references.deleteMany({ where: orderIdFilter }),
    tx.order_transactions.deleteMany({ where: orderIdFilter }),
    tx.order_delivery_histories.deleteMany({ where: orderIdFilter }),
    tx.delivery_man_ignored_orders.deleteMany({ where: orderIdFilter }),
    tx.offline_payments.deleteMany({ where: orderIdFilter }),
    tx.refunds.deleteMany({ where: orderIdFilter }),
    tx.subscription_logs.deleteMany({ where: orderIdFilter }),
    tx.d_m_reviews.deleteMany({ where: orderIdFilter }),
    tx.delivery_histories.deleteMany({ where: orderIdFilter }),
    tx.expenses.deleteMany({ where: orderIdFilter }),
    tx.cash_back_histories.deleteMany({ where: orderIdFilter }),
    tx.track_deliverymen.deleteMany({ where: orderIdFilter }),
    tx.reviews.deleteMany({ where: orderIdFilter }),
    tx.partner_webhook_deliveries.deleteMany({ where: orderIdFilter }),
  ]);
}

/** Bulk delete — one transaction per batch; avoids slow per-order loops and concurrent delete races. */
async function deleteOrdersForRestaurants(restaurantIds: number[]): Promise<number> {
  const orders = await prisma.orders.findMany({
    where: { restaurant_id: { in: restaurantIds } },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  const orderIds = orders.map((o) => Number(o.id));
  if (!orderIds.length) {
    console.log('  no orders to delete');
    return 0;
  }

  const batchSize = 40;
  let deleted = 0;
  for (let offset = 0; offset < orderIds.length; offset += batchSize) {
    const batch = orderIds.slice(offset, offset + batchSize);
    await prisma.$transaction(
      async (tx) => {
        await deleteOrderRelationsBulk(tx, batch);
        const removed = await tx.orders.deleteMany({
          where: { id: { in: batch.map((id) => BigInt(id)) } },
        });
        deleted += removed.count;
      },
      { maxWait: 30_000, timeout: 120_000 }
    );
    console.log(`  orders progress: ${Math.min(offset + batchSize, orderIds.length)}/${orderIds.length} (${deleted} deleted)`);
  }
  return deleted;
}

async function clearFinancialRows(
  vendorId: number,
  restaurantIds: number[],
  orderIds: number[]
): Promise<void> {
  const vid = dec(vendorId);
  const ridFilter = { restaurant_id: { in: restaurantIds.map(dec) } };

  const steps: { label: string; run: () => Promise<{ count: number }> }[] = [
    {
      label: 'withdraw_requests (vendor)',
      run: () => prisma.withdraw_requests.deleteMany({ where: { vendor_id: vid } }),
    },
    {
      label: 'order_transactions (vendor)',
      run: () => prisma.order_transactions.deleteMany({ where: { vendor_id: vid } }),
    },
    {
      label: 'expenses (restaurant)',
      run: () => prisma.expenses.deleteMany({ where: ridFilter }),
    },
    {
      label: 'disbursement_details (restaurant)',
      run: () => prisma.disbursement_details.deleteMany({ where: ridFilter }),
    },
    {
      label: 'account_transactions (restaurant cash)',
      run: () =>
        prisma.account_transactions.deleteMany({
          where: {
            from_type: 'restaurant',
            from_id: { in: restaurantIds.map(dec) },
          },
        }),
    },
    {
      label: 'subscription_transactions (restaurant)',
      run: () => prisma.subscription_transactions.deleteMany({ where: ridFilter }),
    },
    {
      label: 'subscription_billing_and_refund_histories (restaurant)',
      run: () => prisma.subscription_billing_and_refund_histories.deleteMany({ where: ridFilter }),
    },
    {
      label: 'visitor_logs (restaurant)',
      run: () =>
        prisma.visitor_logs.deleteMany({
          where: {
            visitor_log_type: 'restaurant',
            visitor_log_id: { in: restaurantIds.map(dec) },
          },
        }),
    },
  ];

  for (const step of steps) {
    const { count } = await step.run();
    console.log(`  deleted ${step.label}: ${count}`);
  }

  if (orderIds.length) {
    const pr = await deletePaymentRequestsForOrders(orderIds);
    console.log(`  deleted payment_requests (order): ${pr}`);
  }
}

async function resetVendorWalletAndCounters(vendorId: number, restaurantIds: number[]): Promise<void> {
  const vid = dec(vendorId);
  const rw = await prisma.restaurant_wallets.updateMany({
    where: { vendor_id: vid },
    data: {
      total_earning: zeroMoney,
      total_withdrawn: zeroMoney,
      pending_withdraw: zeroMoney,
      collected_cash: zeroMoney,
      updated_at: new Date(),
    },
  });
  console.log(`  reset restaurant_wallets: ${rw.count}`);

  const restaurants = await prisma.restaurants.updateMany({
    where: { id: { in: restaurantIds.map((id) => BigInt(id)) } },
    data: {
      order_count: 0,
      total_order: 0,
      updated_at: new Date(),
    },
  });
  console.log(`  reset restaurant order counters: ${restaurants.count}`);

  const food = await prisma.food.updateMany({
    where: { restaurant_id: { in: restaurantIds } },
    data: {
      order_count: 0,
      sell_count: 0,
      avg_rating: 0,
      rating_count: 0,
      updated_at: new Date(),
    },
  });
  console.log(`  reset food stats: ${food.count}`);

  const addons = await prisma.add_ons.updateMany({
    where: { restaurant_id: { in: restaurantIds.map(dec) } },
    data: { sell_count: 0, updated_at: new Date() },
  });
  console.log(`  reset add_ons sell_count: ${addons.count}`);
}

async function adjustAdminWalletFromDeletedTx(adminCommissionTotal: number): Promise<void> {
  if (adminCommissionTotal <= 0) {
    console.log('  adjust admin_wallets: nothing to subtract');
    return;
  }

  const admin = await prisma.admins.findFirst({
    where: { role_id: dec(1) },
    select: { id: true },
  });
  if (!admin) {
    console.warn('  adjust admin_wallets: no super admin — skipped');
    return;
  }

  const wallet = await prisma.admin_wallets.findFirst({
    where: { admin_id: dec(Number(admin.id)) },
  });
  if (!wallet) {
    console.warn('  adjust admin_wallets: wallet missing — skipped');
    return;
  }

  const current = Number(wallet.total_commission_earning);
  const next = Math.max(0, current - adminCommissionTotal);
  await prisma.admin_wallets.update({
    where: { id: wallet.id },
    data: {
      total_commission_earning: dec(next),
      updated_at: new Date(),
    },
  });
  console.log(
    `  adjust admin_wallets total_commission_earning: ${current.toFixed(2)} → ${next.toFixed(2)} (−${adminCommissionTotal.toFixed(2)})`
  );
}

async function resetOrdersForRecalculation(orderIds: number[]): Promise<void> {
  if (!orderIds.length) return;
  const updated = await prisma.orders.updateMany({
    where: {
      id: { in: orderIds.map((id) => BigInt(id)) },
      payment_status: 'paid',
    },
    data: {
      payment_status: 'unpaid',
      updated_at: new Date(),
    },
  });
  console.log(`  reset payment_status paid→unpaid on ${updated.count} order(s) (re-deliver / settle again)`);
}

async function main(): Promise<void> {
  const { vendor, restaurants } = await resolveVendor(EMAIL);
  const vendorId = Number(vendor.id);
  const restaurantIds = restaurants.map((r) => Number(r.id));

  console.log(
    apply ? 'APPLY — clearing vendor transactional data…' : 'DRY RUN — pass --apply to execute'
  );
  console.log(`Vendor #${vendorId} ${vendor.email}`);
  for (const r of restaurants) {
    console.log(`  Restaurant #${Number(r.id)} "${r.name}"`);
  }
  console.log(keepOrders ? 'Mode: keep orders (wallet + transactions only)\n' : 'Mode: delete all vendor orders\n');

  const orderRows = await prisma.orders.findMany({
    where: { restaurant_id: { in: restaurantIds } },
    select: { id: true },
  });
  const orderIds = orderRows.map((o) => Number(o.id));

  const txAgg = await sumVendorOrderTransactions(vendorId);
  const adminCommissionSum = Number(txAgg._sum.admin_commission ?? 0);
  const restaurantAmountSum = Number(txAgg._sum.restaurant_amount ?? 0);

  const wallet = await prisma.restaurant_wallets.findFirst({ where: { vendor_id: dec(vendorId) } });
  const withdrawCount = await prisma.withdraw_requests.count({ where: { vendor_id: dec(vendorId) } });

  console.log('Current snapshot:');
  console.log(`  orders: ${orderIds.length}`);
  console.log(`  order_transactions: ${txAgg._count}`);
  console.log(`  sum restaurant_amount: ${restaurantAmountSum.toFixed(2)}`);
  console.log(`  sum admin_commission: ${adminCommissionSum.toFixed(2)}`);
  console.log(`  withdraw_requests: ${withdrawCount}`);
  if (wallet) {
    console.log(
      `  wallet total_earning=${Number(wallet.total_earning).toFixed(2)} pending_withdraw=${Number(wallet.pending_withdraw).toFixed(2)} collected_cash=${Number(wallet.collected_cash).toFixed(2)}`
    );
  } else {
    console.log('  wallet: (none — will stay empty until first settlement)');
  }

  if (!apply) {
    console.log('\nRe-run with:');
    console.log(`  npm run db:clear-vendor-transactions -- --email=${EMAIL} --apply`);
    if (!keepOrders) {
      console.log('  Add --keep-orders to keep order rows and only reset wallet/transactions.');
    }
    return;
  }

  await withVendorClearLock(async () => {
    if (!keepOrders) {
      if (orderIds.length) {
        const pr = await deletePaymentRequestsForOrders(orderIds);
        console.log(`\n  deleted payment_requests (order): ${pr}`);
      }
      console.log('\nDeleting orders (bulk)…');
      const deleted = await deleteOrdersForRestaurants(restaurantIds);
      console.log(`  deleted orders: ${deleted}`);
    } else {
      console.log('\nKeeping orders — clearing settlement rows only…');
      await clearFinancialRows(vendorId, restaurantIds, orderIds);
      await resetOrdersForRecalculation(orderIds);
      await resetVendorWalletAndCounters(vendorId, restaurantIds);
      if (adjustAdminWallet) {
        await adjustAdminWalletFromDeletedTx(adminCommissionSum);
      }
      return;
    }

    console.log('\nClearing remaining vendor financial rows…');
    await clearFinancialRows(vendorId, restaurantIds, []);

    console.log('\nResetting wallet and counters…');
    await resetVendorWalletAndCounters(vendorId, restaurantIds);

    if (adjustAdminWallet) {
      await adjustAdminWalletFromDeletedTx(adminCommissionSum);
    }

    const ordersLeft = await prisma.orders.count({ where: { restaurant_id: { in: restaurantIds } } });
    const txLeft = await prisma.order_transactions.count({ where: { vendor_id: dec(vendorId) } });
    const walletAfter = await prisma.restaurant_wallets.findFirst({ where: { vendor_id: dec(vendorId) } });

    console.log('\nDone.');
    console.log(`  orders left: ${ordersLeft}`);
    console.log(`  order_transactions left: ${txLeft}`);
    if (walletAfter) {
      const te = Number(walletAfter.total_earning);
      const pw = Number(walletAfter.pending_withdraw);
      const cc = Number(walletAfter.collected_cash);
      if (te !== 0 || pw !== 0 || cc !== 0) {
        console.error('WARNING: wallet not fully zeroed');
        process.exitCode = 1;
      } else {
        console.log('  wallet: all zeros');
      }
    }
  });
}

function printDbConnectionHelp(): void {
  console.error(`
Cannot reach Postgres (P1001). Start tunnel or local DB, then re-run.

  ./scripts/mac-db-tunnel.sh
  npm run db:clear-vendor-transactions -- --email=${EMAIL} --apply
`);
}

main()
  .catch((e) => {
    const code = (e as { errorCode?: string }).errorCode;
    if (code === 'P1001') {
      printDbConnectionHelp();
    } else {
      console.error(e);
    }
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
