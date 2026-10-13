import { Request, Response } from 'express';
import prisma from '../../config/database';
import { sendApiError, joiFirstMessage, errorMessageFromUnknown } from '../../utils/apiErrorResponse';
import { walletAddFundSchema, walletTransactionsQuerySchema } from '../../schemas/consumer/Wallet';
import {
  formatWalletTransaction,
  WALLET_TX_TYPE_FILTERS,
} from '../../utils/consumer/walletTransactions';
import { paginationSkip } from '../../utils/consumer/orderListHelpers';
import { getBusinessSettingFlag } from '../../utils/consumer/businessSettings';
import { generateWalletAddFundLink } from '../../utils/payment/generatePaymentLink';

/**
 * @Description Customer wallet transaction history (PHP GET /api/v1/customer/wallet/transactions)
 * @Route GET /api/consumer/wallet/transactions
 * @Access Consumer (registered)
 */
export const listWalletTransactions = async (req: Request, res: Response): Promise<any> => {
  const validated = walletTransactionsQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return sendApiError(res, 403, joiFirstMessage(validated.error));
  }
  const { limit, offset, type } = validated.value as {
    limit: number;
    offset: number;
    type?: string;
  };
  const userId = Number(req.user?.id);

  try {
    const typeFilter = type ? WALLET_TX_TYPE_FILTERS[type] : undefined;
    const where = {
      user_id: userId,
      ...(typeFilter ? { transaction_type: { in: typeFilter } } : {}),
    };

    const [total_size, rows] = await Promise.all([
      prisma.wallet_transactions.count({ where }),
      prisma.wallet_transactions.findMany({
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
      data: rows.map(formatWalletTransaction),
    });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Active wallet add-fund bonuses (PHP GET /api/v1/customer/wallet/bonuses)
 * @Route GET /api/consumer/wallet/bonuses
 * @Access Consumer (registered)
 */
export const listWalletBonuses = async (_req: Request, res: Response): Promise<any> => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rows = await prisma.wallet_bonuses.findMany({
      where: {
        status: true,
        OR: [{ start_date: null }, { start_date: { lte: today } }],
      },
      orderBy: { id: 'desc' },
    });
    const running = rows.filter((row) => !row.end_date || row.end_date >= today);
    return res.status(200).json({
      status: true,
      data: running.map((row) => ({
        id: row.id.toString(),
        title: row.title,
        description: row.description,
        bonus_type: row.bonus_type,
        bonus_amount: Number(row.bonus_amount),
        minimum_add_amount: Number(row.minimum_add_amount),
        maximum_bonus_amount: Number(row.maximum_bonus_amount),
        start_date: row.start_date,
        end_date: row.end_date,
      })),
    });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Start wallet top-up via HyperPay (PHP POST /api/v1/customer/wallet/add-fund)
 * @Route POST /api/consumer/wallet/add-fund
 * @Access Consumer (registered)
 */
export const addWalletFund = async (req: Request, res: Response): Promise<any> => {
  const validated = walletAddFundSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return sendApiError(res, 403, joiFirstMessage(validated.error));
  }
  if (!(await getBusinessSettingFlag('digital_payment'))) {
    return sendApiError(res, 403, 'digital_payment_is_disable');
  }
  if (!(await getBusinessSettingFlag('wallet_status'))) {
    return sendApiError(res, 403, 'Customer wallet is disabled');
  }

  const userId = Number(req.user?.id);
  const { amount, payment_method, callback, payment_platform } = validated.value as {
    amount: number;
    payment_method: string;
    callback: string;
    payment_platform: 'app' | 'web';
  };

  const fName = req.user?.f_name ?? '';
  const lName = req.user?.l_name ?? '';

  try {
    const result = await generateWalletAddFundLink({
      userId,
      amount,
      paymentMethod: payment_method === 'digital_payment' ? 'hyper_pay' : payment_method,
      callback,
      paymentPlatform: payment_platform,
      payer: {
        name: `${fName} ${lName}`.trim() || 'Customer',
        email: req.user?.email ?? 'noemail@guest.com',
        phone: req.user?.phone ?? '0000000000',
      },
    });
    return res.status(200).json({ status: true, redirect_link: result.redirect_link });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e, 'Add fund failed'));
  }
};
