import { Request, Response } from 'express';
import prisma from '../../config/database';
import { sendApiError, joiFirstMessage } from '../../utils/apiErrorResponse';
import { dmWalletListQuerySchema, dmWalletWithdrawRequestSchema } from '../../schemas/deliveryman/Wallet';
import { requireDmIdFromRequest } from '../../utils/deliveryman/orderHelpers';
import { paginationSkip } from '../../utils/consumer/orderListHelpers';
import {
  decimalToNumber,
  parseWithdrawalMethodFieldDefs,
  roundMoney,
  toDecimal,
  withdrawApprovedLabel,
} from '../../utils/vendor/walletHelpers';
import { computeDeliveryManWithdrawableBalance } from '../../utils/deliveryman/walletHelpers';
import { Prisma } from '@prisma/client';

async function loadOrCreateDeliveryManWallet(deliveryManId: number) {
  const dmId = toDecimal(deliveryManId);
  let wallet = await prisma.delivery_man_wallets.findFirst({
    where: { delivery_man_id: dmId },
  });
  if (!wallet) {
    const now = new Date();
    wallet = await prisma.delivery_man_wallets.create({
      data: {
        delivery_man_id: dmId,
        total_earning: 0,
        total_withdrawn: 0,
        pending_withdraw: 0,
        collected_cash: 0,
        created_at: now,
        updated_at: now,
      },
    });
  }
  return wallet;
}

function walletSummaryFromRow(wallet: Awaited<ReturnType<typeof loadOrCreateDeliveryManWallet>>) {
  const totalEarning = decimalToNumber(wallet.total_earning);
  const totalWithdrawn = decimalToNumber(wallet.total_withdrawn);
  const pendingWithdraw = decimalToNumber(wallet.pending_withdraw);
  const collectedCash = decimalToNumber(wallet.collected_cash);
  const balance = roundMoney(totalEarning - totalWithdrawn);
  const withdrawableBalance = computeDeliveryManWithdrawableBalance({
    total_earning: totalEarning,
    total_withdrawn: totalWithdrawn,
    pending_withdraw: pendingWithdraw,
    collected_cash: collectedCash,
  });

  return {
    total_earning: roundMoney(totalEarning),
    total_withdrawn: roundMoney(totalWithdrawn),
    pending_withdraw: roundMoney(pendingWithdraw),
    collected_cash: roundMoney(collectedCash),
    balance,
    withdrawable_balance: withdrawableBalance,
  };
}

/**
 * @Description Wallet balance, withdraw requests, payment history, payout methods
 * @Route GET /api/delivery-man/wallet
 * @Access Private (Delivery Man)
 */
export const getDeliveryManWallet = async (req: Request, res: Response): Promise<any> => {
  const deliveryManId = requireDmIdFromRequest(req);
  if (deliveryManId == null) {
    return res.status(401).json({ status: false, msg: 'Unauthorized' });
  }

  const validated = dmWalletListQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return sendApiError(res, 400, joiFirstMessage(validated.error));
  }

  const { limit, search } = validated.value as {
    limit: number;
    offset: number;
    page?: number;
    search?: string;
  };
  const pageNum = validated.value.page ?? validated.value.offset;
  const skip = paginationSkip(limit, pageNum);

  try {
    const wallet = await loadOrCreateDeliveryManWallet(deliveryManId);
    const summary = walletSummaryFromRow(wallet);
    const dmDec = toDecimal(deliveryManId);

    const withdrawWhere: Prisma.withdraw_requestsWhereInput = {
      delivery_man_id: dmDec,
    };

    const [withdrawTotal, withdrawRows, paymentTotal, paymentRows, templateMethods] =
      await Promise.all([
        prisma.withdraw_requests.count({ where: withdrawWhere }),
        prisma.withdraw_requests.findMany({
          where: withdrawWhere,
          orderBy: { id: 'desc' },
          skip,
          take: limit,
        }),
        prisma.account_transactions.count({
          where: {
            type: 'collected',
            from_type: 'deliveryman',
            from_id: dmDec,
            created_by: 'deliveryman',
          },
        }),
        prisma.account_transactions.findMany({
          where: {
            type: 'collected',
            from_type: 'deliveryman',
            from_id: dmDec,
            created_by: 'deliveryman',
          },
          orderBy: { id: 'desc' },
          skip,
          take: limit,
        }),
        prisma.withdrawal_methods.findMany({
          where: { is_active: 1 },
          orderBy: { id: 'asc' },
          select: { id: true, method_name: true, method_fields: true },
        }),
      ]);

    const methodIds = [
      ...new Set(
        withdrawRows
          .map((r) => (r.withdrawal_method_id != null ? Number(r.withdrawal_method_id) : null))
          .filter((id): id is number => id != null && id > 0)
      ),
    ];
    const methodNameById = new Map<number, string>();
    if (methodIds.length) {
      const methods = await prisma.withdrawal_methods.findMany({
        where: { id: { in: methodIds.map((id) => BigInt(id)) } },
        select: { id: true, method_name: true },
      });
      for (const m of methods) methodNameById.set(Number(m.id), m.method_name);
    }

    const withdrawRequests = withdrawRows.map((row, index) => ({
      sl: skip + index + 1,
      id: Number(row.id),
      amount: roundMoney(decimalToNumber(row.amount)),
      request_time: row.created_at?.toISOString() ?? null,
      method: row.withdrawal_method_id
        ? methodNameById.get(Number(row.withdrawal_method_id)) ?? 'Account'
        : 'Adjustment',
      type: row.type ?? 'manual',
      status: withdrawApprovedLabel(Number(row.approved)),
      note: row.transaction_note ?? '',
      can_cancel: Number(row.approved) === 0,
    }));

    const paymentHistory = paymentRows.map((row, index) => ({
      sl: skip + index + 1,
      id: Number(row.id),
      amount: roundMoney(decimalToNumber(row.amount)),
      payment_time: row.created_at?.toISOString() ?? null,
      method: row.method,
      ref: row.ref ?? null,
      status: 'Approved',
    }));

    const withdrawalMethods = templateMethods.map((m) => ({
      id: Number(m.id),
      method_name: m.method_name,
      method_fields: parseWithdrawalMethodFieldDefs(m.method_fields),
    }));

    return res.status(200).json({
      status: true,
      msg: 'Success',
      data: {
        wallet: summary,
        withdrawal_methods: withdrawalMethods,
        withdraw_requests: withdrawRequests,
        withdraw_total_size: withdrawTotal,
        payment_history: paymentHistory,
        payment_total_size: paymentTotal,
        limit,
        offset: pageNum,
        search: search?.trim() || null,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Request failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route POST /api/delivery-man/wallet/withdraw-request
 */
export const requestDeliveryManWithdraw = async (req: Request, res: Response): Promise<any> => {
  const deliveryManId = requireDmIdFromRequest(req);
  if (deliveryManId == null) {
    return res.status(401).json({ status: false, msg: 'Unauthorized' });
  }

  const validated = dmWalletWithdrawRequestSchema.validate(req.body, { stripUnknown: false });
  if (validated.error) return sendApiError(res, 400, joiFirstMessage(validated.error));

  const amount = roundMoney(Number(validated.value.amount));
  const methodId = Number(validated.value.id);

  const method = await prisma.withdrawal_methods.findFirst({
    where: { id: BigInt(methodId), is_active: 1 },
  });
  if (!method) return sendApiError(res, 404, 'Withdraw method not found');

  const fieldDefs = parseWithdrawalMethodFieldDefs(method.method_fields);
  const methodData: Record<string, string> = {};
  for (const field of fieldDefs) {
    if (field.input_name && validated.value[field.input_name] != null) {
      methodData[field.input_name] = String(validated.value[field.input_name]);
    }
  }

  const wallet = await loadOrCreateDeliveryManWallet(deliveryManId);
  const withdrawable = computeDeliveryManWithdrawableBalance({
    total_earning: decimalToNumber(wallet.total_earning),
    total_withdrawn: decimalToNumber(wallet.total_withdrawn),
    pending_withdraw: decimalToNumber(wallet.pending_withdraw),
    collected_cash: decimalToNumber(wallet.collected_cash),
  });

  if (withdrawable < amount) {
    return sendApiError(
      res,
      403,
      `Insufficient balance. Maximum you can withdraw is ${roundMoney(withdrawable)}`
    );
  }

  const now = new Date();
  let withdrawId: number | null = null;
  try {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.withdraw_requests.create({
        data: {
          delivery_man_id: toDecimal(deliveryManId),
          amount,
          transaction_note: null,
          withdrawal_method_id: toDecimal(method.id),
          withdrawal_method_fields: JSON.stringify(methodData),
          approved: 0,
          type: 'manual',
          created_at: now,
          updated_at: now,
        },
      });
      await tx.delivery_man_wallets.update({
        where: { id: wallet.id },
        data: {
          pending_withdraw: decimalToNumber(wallet.pending_withdraw) + amount,
          updated_at: now,
        },
      });
      return row;
    });
    withdrawId = Number(created.id);
  } catch (e) {
    console.error(e);
    return sendApiError(res, 500, 'Withdraw request failed');
  }

  const { notifyAdminOfWithdrawRequest } = await import('../../utils/notifications/sendWithdrawNotifications');
  void notifyAdminOfWithdrawRequest({
    amount,
    withdrawId: withdrawId ?? undefined,
    deliveryManId,
  }).catch((err) => console.error('[notify] admin DM withdraw request failed', err));

  return res.status(200).json({ status: true, msg: 'Withdraw request placed successfully' });
};

/**
 * @Route DELETE /api/delivery-man/wallet/withdraw-request/:id
 */
export const cancelDeliveryManWithdraw = async (req: Request, res: Response): Promise<any> => {
  const deliveryManId = requireDmIdFromRequest(req);
  if (deliveryManId == null) {
    return res.status(401).json({ status: false, msg: 'Unauthorized' });
  }

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return sendApiError(res, 400, 'Invalid withdraw request id');

  const wr = await prisma.withdraw_requests.findFirst({
    where: {
      id: BigInt(id),
      delivery_man_id: toDecimal(deliveryManId),
    },
  });
  if (!wr) return sendApiError(res, 404, 'Withdraw request not found');
  if (Number(wr.approved) !== 0) {
    return sendApiError(res, 400, 'Only pending withdraw requests can be canceled');
  }

  const amount = decimalToNumber(wr.amount);
  const wallet = await loadOrCreateDeliveryManWallet(deliveryManId);

  try {
    await prisma.$transaction([
      prisma.delivery_man_wallets.update({
        where: { id: wallet.id },
        data: {
          pending_withdraw: Math.max(0, decimalToNumber(wallet.pending_withdraw) - amount),
          updated_at: new Date(),
        },
      }),
      prisma.withdraw_requests.delete({ where: { id: BigInt(id) } }),
    ]);
  } catch (e) {
    console.error(e);
    return sendApiError(res, 500, 'Failed to cancel withdraw request');
  }

  return res.status(200).json({ status: true, msg: 'Withdraw request canceled' });
};

/**
 * @Route GET /api/delivery-man/wallet/withdraw-method-options
 */
export const getDeliveryManWithdrawMethodOptions = async (
  _req: Request,
  res: Response
): Promise<any> => {
  const rows = await prisma.withdrawal_methods.findMany({
    where: { is_active: 1 },
    orderBy: { id: 'asc' },
    select: { id: true, method_name: true, method_fields: true },
  });

  return res.status(200).json({
    status: true,
    data: rows.map((row) => ({
      id: Number(row.id),
      method_name: row.method_name,
      method_fields: parseWithdrawalMethodFieldDefs(row.method_fields),
    })),
  });
};
