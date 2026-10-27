/**
 * Clear orders, commissions, wallets, and related financial data for fresh calculation testing.
 *
 * Keeps: admins, vendors, restaurants, customers (users), zones, menus (categories, food,
 * add_ons, variations), delivery men, business settings, coupons config, etc.
 *
 * Usage (Mac — tunnel to prod DB in Terminal 1: ./scripts/mac-db-tunnel.sh):
 *   npm run db:clear-transactions          # dry run
 *   npm run db:clear-transactions -- --apply
 *
 * Usage (Hetzner server — do NOT run mac-db-tunnel.sh on the VPS):
 *   cd ~/gizra-app-backend && git pull
 *   ./scripts/clear-transactions-server.sh --apply
 *   (Do not use `npm run db:clear-transactions` on the host — .env host may not reach DB.)
 *
 * Requires DATABASE_URL in .env (Mac) or backend container env (server).
 */
import dotenv from 'dotenv';
import path from 'path';
import { Prisma } from '@prisma/client';
import prisma from '../src/config/database';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const apply = process.argv.includes('--apply');

const zeroMoney = new Prisma.Decimal('0.00');
const zeroMoney3 = new Prisma.Decimal('0.000');

type Db = typeof prisma;

const deleteSteps: { label: string; count: (db: Db) => Promise<number>; del: (db: Db) => Promise<{ count: number }> }[] = [
  {
    label: 'partner_webhook_deliveries',
    count: (db) => db.partner_webhook_deliveries.count(),
    del: (db) => db.partner_webhook_deliveries.deleteMany(),
  },
  {
    label: 'subscription_logs',
    count: (db) => db.subscription_logs.count(),
    del: (db) => db.subscription_logs.deleteMany(),
  },
  {
    label: 'subscription_billing_and_refund_histories',
    count: (db) => db.subscription_billing_and_refund_histories.count(),
    del: (db) => db.subscription_billing_and_refund_histories.deleteMany(),
  },
  {
    label: 'subscription_transactions',
    count: (db) => db.subscription_transactions.count(),
    del: (db) => db.subscription_transactions.deleteMany(),
  },
  { label: 'track_deliverymen', count: (db) => db.track_deliverymen.count(), del: (db) => db.track_deliverymen.deleteMany() },
  {
    label: 'order_delivery_histories',
    count: (db) => db.order_delivery_histories.count(),
    del: (db) => db.order_delivery_histories.deleteMany(),
  },
  {
    label: 'delivery_man_ignored_orders',
    count: (db) => db.delivery_man_ignored_orders.count(),
    del: (db) => db.delivery_man_ignored_orders.deleteMany(),
  },
  { label: 'delivery_histories', count: (db) => db.delivery_histories.count(), del: (db) => db.delivery_histories.deleteMany() },
  { label: 'order_references', count: (db) => db.order_references.count(), del: (db) => db.order_references.deleteMany() },
  { label: 'order_payments', count: (db) => db.order_payments.count(), del: (db) => db.order_payments.deleteMany() },
  { label: 'offline_payments', count: (db) => db.offline_payments.count(), del: (db) => db.offline_payments.deleteMany() },
  { label: 'order_details', count: (db) => db.order_details.count(), del: (db) => db.order_details.deleteMany() },
  { label: 'order_transactions', count: (db) => db.order_transactions.count(), del: (db) => db.order_transactions.deleteMany() },
  { label: 'refunds', count: (db) => db.refunds.count(), del: (db) => db.refunds.deleteMany() },
  { label: 'd_m_reviews', count: (db) => db.d_m_reviews.count(), del: (db) => db.d_m_reviews.deleteMany() },
  { label: 'reviews', count: (db) => db.reviews.count(), del: (db) => db.reviews.deleteMany() },
  { label: 'expenses', count: (db) => db.expenses.count(), del: (db) => db.expenses.deleteMany() },
  { label: 'cash_back_histories', count: (db) => db.cash_back_histories.count(), del: (db) => db.cash_back_histories.deleteMany() },
  { label: 'orders', count: (db) => db.orders.count(), del: (db) => db.orders.deleteMany() },
  { label: 'account_transactions', count: (db) => db.account_transactions.count(), del: (db) => db.account_transactions.deleteMany() },
  { label: 'disbursement_details', count: (db) => db.disbursement_details.count(), del: (db) => db.disbursement_details.deleteMany() },
  { label: 'disbursements', count: (db) => db.disbursements.count(), del: (db) => db.disbursements.deleteMany() },
  { label: 'provide_d_m_earnings', count: (db) => db.provide_d_m_earnings.count(), del: (db) => db.provide_d_m_earnings.deleteMany() },
  { label: 'withdraw_requests', count: (db) => db.withdraw_requests.count(), del: (db) => db.withdraw_requests.deleteMany() },
  { label: 'wallet_transactions', count: (db) => db.wallet_transactions.count(), del: (db) => db.wallet_transactions.deleteMany() },
  { label: 'wallet_payments', count: (db) => db.wallet_payments.count(), del: (db) => db.wallet_payments.deleteMany() },
  {
    label: 'loyalty_point_transactions',
    count: (db) => db.loyalty_point_transactions.count(),
    del: (db) => db.loyalty_point_transactions.deleteMany(),
  },
  { label: 'incentive_logs', count: (db) => db.incentive_logs.count(), del: (db) => db.incentive_logs.deleteMany() },
  { label: 'carts', count: (db) => db.carts.count(), del: (db) => db.carts.deleteMany() },
  { label: 'visitor_logs', count: (db) => db.visitor_logs.count(), del: (db) => db.visitor_logs.deleteMany() },
  { label: 'logs', count: (db) => db.logs.count(), del: (db) => db.logs.deleteMany() },
  { label: 'user_notifications', count: (db) => db.user_notifications.count(), del: (db) => db.user_notifications.deleteMany() },
  { label: 'messages', count: (db) => db.messages.count(), del: (db) => db.messages.deleteMany() },
  { label: 'conversations', count: (db) => db.conversations.count(), del: (db) => db.conversations.deleteMany() },
  { label: 'subscriptions', count: (db) => db.subscriptions.count(), del: (db) => db.subscriptions.deleteMany() },
  { label: 'subscription_pauses', count: (db) => db.subscription_pauses.count(), del: (db) => db.subscription_pauses.deleteMany() },
];

async function resetBalances(): Promise<void> {
  const rw = await prisma.restaurant_wallets.updateMany({
    data: {
      total_earning: zeroMoney,
      total_withdrawn: zeroMoney,
      pending_withdraw: zeroMoney,
      collected_cash: zeroMoney,
      updated_at: new Date(),
    },
  });
  console.log(`  reset restaurant_wallets: ${rw.count}`);

  const aw = await prisma.admin_wallets.updateMany({
    data: {
      total_commission_earning: zeroMoney,
      digital_received: zeroMoney,
      manual_received: zeroMoney,
      delivery_charge: zeroMoney,
      updated_at: new Date(),
    },
  });
  console.log(`  reset admin_wallets: ${aw.count}`);

  const dm = await prisma.delivery_man_wallets.updateMany({
    data: {
      collected_cash: zeroMoney,
      total_earning: zeroMoney,
      total_withdrawn: zeroMoney,
      pending_withdraw: zeroMoney,
      updated_at: new Date(),
    },
  });
  console.log(`  reset delivery_man_wallets: ${dm.count}`);

  const users = await prisma.users.updateMany({
    data: {
      wallet_balance: zeroMoney3,
      loyalty_point: zeroMoney3,
      order_count: 0,
      updated_at: new Date(),
    },
  });
  console.log(`  reset user wallet/loyalty/order_count: ${users.count}`);

  const restaurants = await prisma.restaurants.updateMany({
    data: {
      order_count: 0,
      total_order: 0,
      updated_at: new Date(),
    },
  });
  console.log(`  reset restaurant order counters: ${restaurants.count}`);

  const food = await prisma.food.updateMany({
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
    data: { sell_count: 0, updated_at: new Date() },
  });
  console.log(`  reset add_ons sell_count: ${addons.count}`);

  const opts = await prisma.variation_options.updateMany({
    data: { sell_count: 0, updated_at: new Date() },
  });
  console.log(`  reset variation_options sell_count: ${opts.count}`);

  const riders = await prisma.delivery_men.updateMany({
    data: {
      current_orders: 0,
      order_count: 0,
      assigned_order_count: 0,
      updated_at: new Date(),
    },
  });
  console.log(`  reset delivery_men counters: ${riders.count}`);

  const coupons = await prisma.coupons.updateMany({
    data: { total_uses: zeroMoney, updated_at: new Date() },
  });
  console.log(`  reset coupon total_uses: ${coupons.count}`);

  const cashBacks = await prisma.cash_backs.updateMany({
    data: { total_used: 0, updated_at: new Date() },
  });
  console.log(`  reset cash_backs total_used: ${cashBacks.count}`);
}

async function main(): Promise<void> {
  console.log(apply ? 'APPLY — clearing transactional data…' : 'DRY RUN — pass --apply to execute');
  console.log('Preserved: admins, vendors, restaurants, users, zones, menus, delivery_men, settings\n');

  if (!apply) {
    for (const step of deleteSteps) {
      const n = await step.count(prisma);
      if (n > 0) console.log(`  ${step.label}: ${n} rows`);
    }
    console.log('\nRe-run with: npm run db:clear-transactions -- --apply');
    return;
  }

  for (const step of deleteSteps) {
    const { count } = await step.del(prisma);
    console.log(`  deleted ${step.label}: ${count}`);
  }

  await prisma.$executeRawUnsafe('DELETE FROM payment_requests');
  console.log('  deleted payment_requests (raw)');

  await prisma.$executeRawUnsafe('DELETE FROM campaign_restaurant');
  console.log('  deleted campaign_restaurant (raw)');

  console.log('\nResetting wallet balances and counters…');
  await resetBalances();

  const ordersLeft = await prisma.orders.count();
  const txLeft = await prisma.order_transactions.count();
  const verify = await prisma.$queryRaw<
    [{ earning: number; commission: number; wallet_earning: number; admin_commission: number }]
  >`
    SELECT
      COALESCE((SELECT SUM(restaurant_amount)::float FROM order_transactions), 0) AS earning,
      COALESCE((SELECT SUM(admin_commission)::float FROM order_transactions), 0) AS commission,
      COALESCE((SELECT SUM(total_earning)::float FROM restaurant_wallets), 0) AS wallet_earning,
      COALESCE((SELECT SUM(total_commission_earning)::float FROM admin_wallets), 0) AS admin_commission
  `;
  const v = verify[0];
  console.log(`\nDone. orders=${ordersLeft}, order_transactions=${txLeft}`);
  console.log('Verification (should all be 0 for dashboard / profit):');
  console.log(`  order_transactions earning sum:     ${v.earning}`);
  console.log(`  order_transactions commission sum:  ${v.commission}`);
  console.log(`  restaurant_wallets total_earning:   ${v.wallet_earning}`);
  console.log(`  admin_wallets commission_earning:   ${v.admin_commission}`);
  if (ordersLeft > 0 || txLeft > 0 || v.earning > 0 || v.commission > 0) {
    console.error('\nWARNING: financial rows still present — re-run or check FK errors.');
    process.exitCode = 1;
  }
}

function printDbConnectionHelp(): void {
  console.error(`
Cannot reach Postgres (P1001). Your .env uses DATABASE_URL @ 127.0.0.1:5434 — start ONE of:

  A) Remote prod/staging data (Mac dev):
     Terminal 1:  ./scripts/mac-db-tunnel.sh
     Terminal 2:  npm run db:clear-transactions -- --apply

  B) Local Docker Postgres:
     Start Docker Desktop, then from gizra-backend:
     npm run prepare:compose-env && docker compose up -d postgres

  Test:  pg_isready -h 127.0.0.1 -p 5434
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
