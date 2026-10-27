import { Request, Response } from 'express';
import prisma from '../../config/database';
import { sendApiError, joiFirstMessage, errorMessageFromUnknown } from '../../utils/apiErrorResponse';
import {
  loyaltyTransferSchema,
  loyaltyTransactionsQuerySchema,
} from '../../schemas/consumer/Wallet';
import {
  createLoyaltyPointTransaction,
  createWalletTransaction,
  formatLoyaltyTransaction,
} from '../../utils/consumer/walletTransactions';
import { paginationSkip } from '../../utils/consumer/orderListHelpers';
import {
  getBusinessSettingFlag,
  getBusinessSettingNumber,
} from '../../utils/consumer/businessSettings';

/**
 * @Description Convert loyalty points to wallet balance (PHP POST /api/v1/customer/loyalty-point/point-transfer)
 * @Route POST /api/consumer/loyalty-point/transfer
 * @Access Consumer (registered)
 */
export const transferLoyaltyPoints = async (req: Request, res: Response): Promise<any> => {
  const validated = loyaltyTransferSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return sendApiError(res, 403, joiFirstMessage(validated.error));
  }
  if (!(await getBusinessSettingFlag('loyalty_point_status'))) {
    return sendApiError(res, 203, 'Loyalty points are disabled');
  }

  const userId = Number(req.user?.id);
  const { point, reference } = validated.value as { point: number; reference?: string };
  const minPoints = await getBusinessSettingNumber('loyalty_point_minimum_point', 0);

  try {
    const user = await prisma.users.findUnique({
      where: { id: BigInt(userId) },
      select: { loyalty_point: true },
    });
    const current = Number(user?.loyalty_point ?? 0);
    if (current <= 0 || current < minPoints || point > current) {
      return res.status(203).json({
        status: false,
        msg: 'Insufficient point',
        errors: [{ code: 'point', message: 'Insufficient point' }],
      });
    }

    await prisma.$transaction(async (tx) => {
      const walletTx = await createWalletTransaction(tx, {
        userId,
        amount: point,
        transactionType: 'loyalty_point',
        reference: reference ?? null,
      });
      await createLoyaltyPointTransaction(tx, {
        userId,
        amount: point,
        transactionType: 'point_to_wallet',
        reference: walletTx?.transaction_id ?? null,
      });
    });

    return res.status(200).json({
      status: true,
      msg: 'Point to wallet transfer successfully',
      message: 'Point to wallet transfer successfully',
    });
  } catch (e: unknown) {
    return res.status(203).json({
      status: false,
      msg: errorMessageFromUnknown(e, 'Failed to transfer'),
      errors: [{ code: 'customer_wallet', message: 'Failed to transfer' }],
    });
  }
};

/**
 * @Description Loyalty point transaction history (PHP GET /api/v1/customer/loyalty-point/transactions)
 * @Route GET /api/consumer/loyalty-point/transactions
 * @Access Consumer (registered)
 */
export const listLoyaltyTransactions = async (req: Request, res: Response): Promise<any> => {
  const validated = loyaltyTransactionsQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return sendApiError(res, 403, joiFirstMessage(validated.error));
  }
  const { limit, offset } = validated.value as { limit: number; offset: number };
  const userId = Number(req.user?.id);

  try {
    const where = { user_id: userId };
    const [total_size, rows] = await Promise.all([
      prisma.loyalty_point_transactions.count({ where }),
      prisma.loyalty_point_transactions.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: paginationSkip(limit, offset),
        take: limit,
      }),
    ]);
    return res.status(200).json({
      status: true,
      total_size,
      limit,
      offset,
      data: rows.map(formatLoyaltyTransaction),
    });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};
