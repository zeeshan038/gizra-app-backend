import { Request, Response } from 'express';
import prisma from '../../config/database';
import { sendApiError, joiFirstMessage } from '../../utils/apiErrorResponse';
import { getVendorContext } from '../../utils/vendor/context';
import {
  computeRestaurantWalletBalance,
  computeWithdrawableEarning,
  decimalToNumber,
  parseWithdrawalMethodFieldDefs,
  roundMoney,
  withdrawApprovedLabel,
  toDecimal,
} from '../../utils/vendor/walletHelpers';
import { vendorWalletWithdrawRequestSchema } from '../../schemas/vendor/wallet';

async function loadOrCreateWallet(vendorId: number) {
  const vid = toDecimal(vendorId);
  let wallet = await prisma.restaurant_wallets.findFirst({
    where: { vendor_id: vid },
  });
  if (!wallet) {
    const now = new Date();
    wallet = await prisma.restaurant_wallets.create({
      data: {
        vendor_id: vid,
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

function walletSummaryFromRow(wallet: Awaited<ReturnType<typeof loadOrCreateWallet>>) {
  const totalEarning = decimalToNumber(wallet.total_earning);
  const totalWithdrawn = decimalToNumber(wallet.total_withdrawn);
  const pendingWithdraw = decimalToNumber(wallet.pending_withdraw);
  const collectedCash = decimalToNumber(wallet.collected_cash);
  let balance = computeRestaurantWalletBalance({
    total_earning: totalEarning,
    total_withdrawn: totalWithdrawn,
    pending_withdraw: pendingWithdraw,
    collected_cash: collectedCash,
  });
  if (balance < 0) balance = 0;
  const withdrawableEarning = computeWithdrawableEarning({
    total_earning: totalEarning,
    total_withdrawn: totalWithdrawn,
    pending_withdraw: pendingWithdraw,
  });

  return {
    collectedCash: roundMoney(collectedCash),
    balance: roundMoney(balance),
    withdrawableEarning: roundMoney(withdrawableEarning),
    pendingWithdraw: roundMoney(pendingWithdraw),
    totalWithdrawn: roundMoney(totalWithdrawn),
    totalEarning: roundMoney(totalEarning),
  };
}

/**
 * @Route GET /api/vendor/wallet
 */
export const getVendorWallet = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) return sendApiError(res, 403, 'Restaurant context not found for vendor');

  const wallet = await loadOrCreateWallet(ctx.vendorId);
  const summary = walletSummaryFromRow(wallet);

  const withdrawRows = await prisma.$queryRaw<
    Array<{
      id: bigint;
      amount: unknown;
      transaction_note: string | null;
      type: string;
      approved: number;
      created_at: Date | null;
      withdrawal_method_id: unknown;
      withdrawal_method_fields: string | null;
    }>
  >`
    SELECT id, amount, transaction_note, type, approved::int AS approved, created_at,
           withdrawal_method_id, withdrawal_method_fields
    FROM withdraw_requests
    WHERE vendor_id = ${toDecimal(ctx.vendorId)}
    ORDER BY id DESC
    LIMIT 100
  `;

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
    sl: index + 1,
    id: Number(row.id),
    amount: roundMoney(decimalToNumber(row.amount as never)),
    requestTime: row.created_at ? row.created_at.toISOString().replace('T', ' ').slice(0, 19) : '',
    method: row.withdrawal_method_id
      ? methodNameById.get(Number(row.withdrawal_method_id)) ?? 'Account'
      : 'Adjustment',
    type: row.type ?? 'manual',
    status: withdrawApprovedLabel(Number(row.approved)),
    note: row.transaction_note ?? '',
    action: Number(row.approved) === 0 ? 'pending' : '',
  }));

  const paymentRows = await prisma.account_transactions.findMany({
    where: {
      type: 'collected',
      created_by: 'restaurant',
      from_type: 'restaurant',
      from_id: toDecimal(ctx.vendorId),
    },
    orderBy: { id: 'desc' },
    take: 50,
  });

  const paymentHistory = paymentRows.map((row, index) => ({
    sl: index + 1,
    amount: roundMoney(decimalToNumber(row.amount)),
    paymentTime: row.created_at ? row.created_at.toISOString().replace('T', ' ').slice(0, 19) : '',
    method: row.method,
    status: 'Paid',
  }));

  const disbursements = await prisma.disbursement_details.findMany({
    where: { restaurant_id: toDecimal(ctx.restaurantId) },
    orderBy: { id: 'desc' },
    take: 50,
  });

  const payoutMethodIds = [
    ...new Set(disbursements.map((d) => Number(d.payment_method)).filter((id) => id > 0)),
  ];
  const payoutMethodNames = new Map<number, string>();
  if (payoutMethodIds.length) {
    const saved = await prisma.disbursement_withdrawal_methods.findMany({
      where: { id: { in: payoutMethodIds.map((id) => BigInt(id)) } },
      select: { id: true, method_name: true },
    });
    for (const s of saved) payoutMethodNames.set(Number(s.id), s.method_name);
  }

  const nextPayouts = disbursements.map((row, index) => ({
    sl: index + 1,
    id: Number(row.disbursement_id),
    createdAt: row.created_at ? row.created_at.toISOString().replace('T', ' ').slice(0, 19) : '',
    amount: roundMoney(Number(row.disbursement_amount)),
    method: payoutMethodNames.get(Number(row.payment_method)) ?? '—',
    payoutDate: row.updated_at ? row.updated_at.toISOString().slice(0, 10) : '',
    status: row.status,
    action: '',
  }));

  const templateMethods = await prisma.withdrawal_methods.findMany({
    where: { is_active: 1 },
    orderBy: { id: 'asc' },
    select: { id: true, method_name: true, method_fields: true },
  });

  const withdrawalMethods = templateMethods.map((m) => ({
    id: Number(m.id),
    method_name: m.method_name,
    method_fields: parseWithdrawalMethodFieldDefs(m.method_fields),
  }));

  return res.status(200).json({
    ...summary,
    withdrawalMethods,
    withdrawRequests,
    paymentHistory,
    nextPayouts,
  });
};

/**
 * @Route POST /api/vendor/wallet/withdraw-request
 */
export const requestVendorWithdraw = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) return sendApiError(res, 403, 'Restaurant context not found for vendor');

  const validated = vendorWalletWithdrawRequestSchema.validate(req.body, { stripUnknown: false });
  if (validated.error) return sendApiError(res, 403, joiFirstMessage(validated.error));

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

  const wallet = await loadOrCreateWallet(ctx.vendorId);
  const balance = computeRestaurantWalletBalance({
    total_earning: decimalToNumber(wallet.total_earning),
    total_withdrawn: decimalToNumber(wallet.total_withdrawn),
    pending_withdraw: decimalToNumber(wallet.pending_withdraw),
    collected_cash: decimalToNumber(wallet.collected_cash),
  });

  if (balance < amount) {
    return sendApiError(res, 403, 'Insufficient balance');
  }

  const now = new Date();
  try {
    await prisma.$transaction([
      prisma.withdraw_requests.create({
        data: {
          vendor_id: toDecimal(ctx.vendorId),
          amount,
          transaction_note: null,
          withdrawal_method_id: toDecimal(method.id),
          withdrawal_method_fields: JSON.stringify(methodData),
          approved: false,
          type: 'manual',
          created_at: now,
          updated_at: now,
        },
      }),
      prisma.restaurant_wallets.update({
        where: { id: wallet.id },
        data: {
          pending_withdraw: decimalToNumber(wallet.pending_withdraw) + amount,
          updated_at: now,
        },
      }),
    ]);
  } catch (e) {
    console.error(e);
    return sendApiError(res, 500, 'Withdraw request failed');
  }

  return res.status(200).json({ status: true, msg: 'Withdraw request placed successfully' });
};

/**
 * @Route GET /api/vendor/wallet/withdraw-method-options
 */
export const getVendorWithdrawMethodOptions = async (_req: Request, res: Response): Promise<any> => {
  const rows = await prisma.withdrawal_methods.findMany({
    where: { is_active: 1 },
    orderBy: { id: 'asc' },
  });
  return res.status(200).json(
    rows.map((row) => ({
      id: Number(row.id),
      method_name: row.method_name,
      method_fields: parseWithdrawalMethodFieldDefs(row.method_fields),
    }))
  );
};
