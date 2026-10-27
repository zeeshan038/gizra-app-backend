/**
 * Report manual-dispatch orders settled today with received_by != restaurant.
 * Wallet backfill requires manual review — run after deploying prepaid/restaurant settlement fix.
 *
 * Usage: npx ts-node scripts/reportManualDispatchSettlementToday.ts
 */
import prisma from '../src/config/database';

async function main() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const orders = await prisma.orders.findMany({
    where: {
      is_manual_dispatch: true,
      order_status: 'delivered',
      delivered: { gte: start },
    },
    select: {
      id: true,
      payment_status: true,
      order_amount: true,
      delivered: true,
    },
  });

  if (orders.length === 0) {
    console.log('No manual-dispatch orders delivered today.');
    return;
  }

  const txs = await prisma.order_transactions.findMany({
    where: { order_id: { in: orders.map((o) => o.id) } },
    select: { order_id: true, received_by: true, admin_commission: true, delivery_charge: true },
  });
  const byOrder = new Map(txs.map((t) => [t.order_id.toString(), t]));

  let needsReview = 0;
  for (const o of orders) {
    const tx = byOrder.get(o.id.toString());
    if (!tx) {
      console.log(`ORDER ${o.id}: delivered but NO settlement row`);
      needsReview++;
      continue;
    }
    if (tx.received_by !== 'restaurant') {
      console.log(
        `ORDER ${o.id}: received_by=${tx.received_by} (expected restaurant) payment_status=${o.payment_status}`
      );
      needsReview++;
    } else {
      console.log(
        `ORDER ${o.id}: OK received_by=restaurant commission=${tx.admin_commission} delivery=${tx.delivery_charge}`
      );
    }
  }

  console.log(`\nSummary: ${orders.length} delivered today, ${needsReview} need review/backfill.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
