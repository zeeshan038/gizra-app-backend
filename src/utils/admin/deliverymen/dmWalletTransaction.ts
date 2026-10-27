import { randomUUID } from 'crypto';
import prisma from '../../../config/database';

/**
 * Mirrors Laravel Helpers::dm_wallet_transaction (bonus + incentive payouts).
 */
export async function dmWalletTransaction(
  deliveryManId: number,
  amount: number,
  reference: string | null = null,
  type = 'dm_admin_bonus'
): Promise<boolean> {
  if (!Number.isFinite(amount) || amount <= 0) return false;

  try {
    await prisma.$transaction(async (tx) => {
      let wallet = await tx.delivery_man_wallets.findFirst({
        where: { delivery_man_id: deliveryManId },
      });
      if (!wallet) {
        wallet = await tx.delivery_man_wallets.create({
          data: {
            delivery_man_id: deliveryManId,
            created_at: new Date(),
            updated_at: new Date(),
          },
        });
      }

      const prevTotal = Number(wallet.total_earning);
      const newBalance = prevTotal + amount;
      const now = new Date();

      await tx.wallet_transactions.create({
        data: {
          transaction_id: randomUUID(),
          reference,
          transaction_type: type,
          admin_bonus: amount,
          credit: amount,
          debit: 0,
          balance: newBalance,
          delivery_man_id: deliveryManId,
          created_at: now,
          updated_at: now,
        },
      });

      await tx.delivery_man_wallets.update({
        where: { id: wallet.id },
        data: { total_earning: newBalance, updated_at: now },
      });

      await tx.expenses.create({
        data: {
          type,
          amount,
          created_by: 'admin',
          delivery_man_id: deliveryManId,
          created_at: now,
          updated_at: now,
        },
      });
    });
    return true;
  } catch (e) {
    console.error('[dmWalletTransaction]', e);
    return false;
  }
}
