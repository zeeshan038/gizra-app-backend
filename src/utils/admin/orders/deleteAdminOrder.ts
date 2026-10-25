import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';

type Tx = Prisma.TransactionClient;

function orderIdDec(orderId: number): Prisma.Decimal {
  return new Prisma.Decimal(orderId);
}

/** Remove rows linked by order_id (Decimal) then delete the order. Admin-only. */
async function deleteOrderRelations(tx: Tx, orderId: number) {
  const where = { order_id: orderIdDec(orderId) };

  await Promise.all([
    tx.order_details.deleteMany({ where }),
    tx.order_payments.deleteMany({ where }),
    tx.order_references.deleteMany({ where }),
    tx.order_transactions.deleteMany({ where }),
    tx.order_delivery_histories.deleteMany({ where }),
    tx.delivery_man_ignored_orders.deleteMany({ where }),
    tx.offline_payments.deleteMany({ where }),
    tx.refunds.deleteMany({ where }),
    tx.subscription_logs.deleteMany({ where }),
    tx.d_m_reviews.deleteMany({ where }),
    tx.delivery_histories.deleteMany({ where }),
    tx.expenses.deleteMany({ where }),
    tx.cash_back_histories.deleteMany({ where }),
    tx.track_deliverymen.deleteMany({ where }),
    tx.reviews.deleteMany({ where }),
    tx.partner_webhook_deliveries.deleteMany({ where }),
  ]);
}

export async function deleteAdminOrder(orderId: number) {
  const existing = await prisma.orders.findUnique({
    where: { id: BigInt(orderId) },
    select: { id: true },
  });
  if (!existing) {
    return { ok: false as const, msg: 'Order not found' };
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        await deleteOrderRelations(tx, orderId);
        const removed = await tx.orders.deleteMany({ where: { id: BigInt(orderId) } });
        if (removed.count === 0) {
          throw new Error('Order not found');
        }
      },
      { maxWait: 15_000, timeout: 60_000 }
    );
    return { ok: true as const };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to delete order';
    if (msg !== 'Order not found') {
      console.error('[deleteAdminOrder]', orderId, e);
    }
    return { ok: false as const, msg };
  }
}
