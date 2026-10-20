import { Request, Response } from 'express';
import {
  adminCollectCashAccountDataQuerySchema,
  adminCollectCashAccountsQuerySchema,
  adminCollectCashListQuerySchema,
  adminCollectCashSchema,
} from '../../schemas/admin/CollectCash';
import {
  collectCash,
  getCollectCashAccountData,
  listCollectCashTransactions,
  searchCollectCashAccounts,
} from '../../utils/admin/transactions/collectCash';

/**
 * @Route GET /api/admin/transactions/collect-cash
 */
export const listAdminCollectCash = async (req: Request, res: Response): Promise<any> => {
  const validated = adminCollectCashListQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const data = await listCollectCashTransactions(validated.value);
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route GET /api/admin/transactions/collect-cash/accounts
 */
export const searchAdminCollectCashAccounts = async (req: Request, res: Response): Promise<any> => {
  const validated = adminCollectCashAccountsQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const data = await searchCollectCashAccounts(validated.value.type, validated.value.search);
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route GET /api/admin/transactions/collect-cash/account-data
 */
export const getAdminCollectCashAccountData = async (req: Request, res: Response): Promise<any> => {
  const validated = adminCollectCashAccountDataQuerySchema.validate(req.query, {
    stripUnknown: true,
  });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const data = await getCollectCashAccountData(validated.value.type, validated.value.id);
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return res.status(400).json({ status: false, msg });
  }
};

/**
 * @Route POST /api/admin/transactions/collect-cash
 */
export const createAdminCollectCash = async (req: Request, res: Response): Promise<any> => {
  const validated = adminCollectCashSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const data = await collectCash(validated.value);
    return res.status(201).json({ status: true, msg: 'Cash collected successfully', data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Collect cash failed';
    return res.status(400).json({ status: false, msg });
  }
};
