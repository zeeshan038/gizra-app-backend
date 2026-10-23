/**
 * Moves COD settlement from driver → restaurant for manual-dispatch orders delivered today
 * when received_by was wrongly set to deliveryman (legacy unpaid/COD path).
 *
 * Dry run (default): npx ts-node scripts/fixManualDispatchCashHandToday.ts
 * Apply:           npx ts-node scripts/fixManualDispatchCashHandToday.ts --apply
 */
import prisma from '../src/config/database';

const apply = process.argv.includes('--apply');

function n(v: unknown): number {
  return Number(v) || 0;
}

async function main() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const orders = await prisma.orders.findMany({
    where: {
      is_manual_dispatch: true,
      order_status: 'delivered',
      delivered: { gte: start },
    },
    include: {
      order_transactions: { take: 1 },
    },
  });

  let fixed = 0;
  for (const order of orders) {
    const tx = order.order_transactions[0];
    if (!tx || tx.received_by === 'restaurant') continue;

    const collectAmount = n(order.order_amount) - n(order.partially_paid_amount);
    if (collectAmount <= 0) continue;

    const vendorId = n(tx.vendor_id);
    const dmId = order.delivery_man_id != null ? n(order.delivery_man_id) : null;

    console.log(
      `${apply ? 'APPLY' : 'DRY'} order ${order.id}: received_by ${tx.received_by} → restaurant, amount ${collectAmount}`
    );

    if (!apply) {
      fixed++;
      continue;
    }

    await prisma.$transaction(async (db) => {
      await db.order_transactions.update({
        where: { id: tx.id },
        data: { received_by: 'restaurant', updated_at: new Date() },
      });

      const vendorWallet = await db.restaurant_wallets.findFirst({
        where: { vendor_id: vendorId },
      });
      if (vendorWallet) {
        await db.restaurant_wallets.update({
          where: { id: vendorWallet.id },
          data: {
            collected_cash: { increment: collectAmount },
            updated_at: new Date(),
          },
        });
      }

      if (dmId != null) {
        const dmWallet = await db.delivery_man_wallets.findFirst({
          where: { delivery_man_id: dmId },
        });
        if (dmWallet && n(dmWallet.collected_cash) >= collectAmount) {
          await db.delivery_man_wallets.update({
            where: { id: dmWallet.id },
            data: {
              collected_cash: { decrement: collectAmount },
              updated_at: new Date(),
            },
          });
        } else {
          console.warn(`  skip dm collected_cash decrement — insufficient balance order ${order.id}`);
        }
      }
    });

    fixed++;
  }

  console.log(`\n${fixed} order(s) ${apply ? 'updated' : 'would be updated'}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
