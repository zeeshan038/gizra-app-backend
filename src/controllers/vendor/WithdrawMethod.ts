import { Request, Response } from 'express';
import prisma from '../../config/database';
import { sendApiError, joiFirstMessage } from '../../utils/apiErrorResponse';
import { getVendorContext } from '../../utils/vendor/context';
import {
  parseMethodFieldsJson,
  parseWithdrawalMethodFieldDefs,
  toDecimal,
} from '../../utils/vendor/walletHelpers';
import {
  vendorWithdrawMethodDefaultSchema,
  vendorWithdrawMethodListQuerySchema,
  vendorWithdrawMethodStoreSchema,
} from '../../schemas/vendor/wallet';

/**
 * @Route GET /api/vendor/withdraw-method
 */
export const listVendorWithdrawMethods = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) return sendApiError(res, 403, 'Restaurant context not found for vendor');

  const validated = vendorWithdrawMethodListQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) return sendApiError(res, 403, joiFirstMessage(validated.error));

  const { limit, offset, search } = validated.value;
  const skip = (offset - 1) * limit;
  const searchKey = String(search ?? '').trim();

  const where = {
    restaurant_id: toDecimal(ctx.restaurantId),
    ...(searchKey
      ? {
          method_name: { contains: searchKey, mode: 'insensitive' as const },
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.disbursement_withdrawal_methods.count({ where }),
    prisma.disbursement_withdrawal_methods.findMany({
      where,
      orderBy: { id: 'desc' },
      skip,
      take: limit,
    }),
  ]);

  const methods = rows.map((row) => {
    const fields = parseMethodFieldsJson(row.method_fields);
    const userInputs = Object.entries(fields).map(([user_input, user_data]) => ({
      user_input,
      user_data,
    }));
    return {
      id: Number(row.id),
      method_name: row.method_name,
      method_fields: fields,
      method_fields_list: userInputs,
      is_default: Number(row.is_default) === 1,
      withdrawal_method_id: Number(row.withdrawal_method_id),
    };
  });

  return res.status(200).json({
    total_size: total,
    limit,
    offset,
    methods,
  });
};

/**
 * @Route GET /api/vendor/withdraw-method/available
 */
export const listAvailableWithdrawMethodTemplates = async (_req: Request, res: Response): Promise<any> => {
  const rows = await prisma.withdrawal_methods.findMany({
    where: { is_active: 1 },
    orderBy: { id: 'asc' },
  });

  const methods = rows.map((row) => ({
    id: Number(row.id),
    method_name: row.method_name,
    method_fields: parseWithdrawalMethodFieldDefs(row.method_fields),
  }));

  return res.status(200).json(methods);
};

/**
 * @Route POST /api/vendor/withdraw-method
 */
export const storeVendorWithdrawMethod = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) return sendApiError(res, 403, 'Restaurant context not found for vendor');

  const validated = vendorWithdrawMethodStoreSchema.validate(req.body, { stripUnknown: false });
  if (validated.error) return sendApiError(res, 403, joiFirstMessage(validated.error));

  const method = await prisma.withdrawal_methods.findFirst({
    where: { id: BigInt(validated.value.withdraw_method_id), is_active: 1 },
  });
  if (!method) return sendApiError(res, 404, 'Withdraw method not found');

  const fieldDefs = parseWithdrawalMethodFieldDefs(method.method_fields);
  const methodData: Record<string, string> = {};
  for (const field of fieldDefs) {
    if (field.input_name && validated.value[field.input_name] != null) {
      methodData[field.input_name] = String(validated.value[field.input_name]);
    }
  }

  const now = new Date();
  await prisma.disbursement_withdrawal_methods.create({
    data: {
      restaurant_id: toDecimal(ctx.restaurantId),
      withdrawal_method_id: toDecimal(method.id),
      method_name: method.method_name,
      method_fields: JSON.stringify(methodData),
      is_default: 0,
      created_at: now,
      updated_at: now,
    },
  });

  return res.status(200).json({ status: true, msg: 'Successfully added!' });
};

/**
 * @Route PATCH /api/vendor/withdraw-method/default
 */
export const setVendorWithdrawMethodDefault = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) return sendApiError(res, 403, 'Restaurant context not found for vendor');

  const validated = vendorWithdrawMethodDefaultSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) return sendApiError(res, 403, joiFirstMessage(validated.error));

  const { id, is_default } = validated.value;
  const row = await prisma.disbursement_withdrawal_methods.findFirst({
    where: { id: BigInt(id), restaurant_id: toDecimal(ctx.restaurantId) },
  });
  if (!row) return sendApiError(res, 404, 'Method not found');

  await prisma.$transaction([
    prisma.disbursement_withdrawal_methods.update({
      where: { id: row.id },
      data: { is_default, updated_at: new Date() },
    }),
    ...(is_default === 1
      ? [
          prisma.disbursement_withdrawal_methods.updateMany({
            where: {
              restaurant_id: toDecimal(ctx.restaurantId),
              NOT: { id: row.id },
            },
            data: { is_default: 0, updated_at: new Date() },
          }),
        ]
      : []),
  ]);

  return res.status(200).json({ status: true, msg: 'Method updated successfully' });
};

/**
 * @Route DELETE /api/vendor/withdraw-method/:id
 */
export const deleteVendorWithdrawMethod = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) return sendApiError(res, 403, 'Restaurant context not found for vendor');

  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return sendApiError(res, 403, 'Invalid id');

  const row = await prisma.disbursement_withdrawal_methods.findFirst({
    where: { id: BigInt(id), restaurant_id: toDecimal(ctx.restaurantId) },
  });
  if (!row) return sendApiError(res, 404, 'Method not found');

  await prisma.disbursement_withdrawal_methods.delete({ where: { id: row.id } });

  return res.status(200).json({ status: true, msg: 'Method deleted successfully' });
};
