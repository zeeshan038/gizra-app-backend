import { Request, Response } from 'express';
import {
  adminWithdrawMethodDefaultSchema,
  adminWithdrawMethodListQuerySchema,
  adminWithdrawMethodStatusSchema,
  adminWithdrawMethodStoreSchema,
  adminWithdrawMethodUpdateSchema,
} from '../../schemas/admin/WithdrawMethod';
import {
  createWithdrawMethod,
  deleteWithdrawMethod,
  getWithdrawMethod,
  listWithdrawMethods,
  setWithdrawMethodActive,
  setWithdrawMethodDefault,
  updateWithdrawMethod,
} from '../../utils/admin/withdraw/withdrawMethods';

/**
 * @Route GET /api/admin/transactions/withdraw-methods
 */
export const listAdminWithdrawMethods = async (req: Request, res: Response): Promise<any> => {
  const validated = adminWithdrawMethodListQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }

  try {
    const result = await listWithdrawMethods(validated.value);
    return res.status(200).json({
      status: true,
      data: result.data,
      total: result.total,
      page: result.page,
      limit: result.limit,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Fetch failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route GET /api/admin/transactions/withdraw-methods/:id
 */
export const getAdminWithdrawMethod = async (req: Request, res: Response): Promise<any> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ status: false, msg: 'Invalid method id' });
  }

  try {
    const row = await getWithdrawMethod(id);
    if (!row) return res.status(404).json({ status: false, msg: 'Withdraw method not found' });
    return res.status(200).json({ status: true, data: row });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Fetch failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route POST /api/admin/transactions/withdraw-methods
 */
export const createAdminWithdrawMethod = async (req: Request, res: Response): Promise<any> => {
  const validated = adminWithdrawMethodStoreSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }

  try {
    const row = await createWithdrawMethod(validated.value);
    return res.status(200).json({ status: true, msg: 'Withdrawal method added successfully', data: row });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Create failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route PUT /api/admin/transactions/withdraw-methods/:id
 */
export const updateAdminWithdrawMethod = async (req: Request, res: Response): Promise<any> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ status: false, msg: 'Invalid method id' });
  }

  const validated = adminWithdrawMethodUpdateSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }

  try {
    const row = await updateWithdrawMethod(id, validated.value);
    if (!row) return res.status(404).json({ status: false, msg: 'Withdraw method not found' });
    return res.status(200).json({ status: true, msg: 'Withdrawal method updated successfully', data: row });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Update failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route PATCH /api/admin/transactions/withdraw-methods/:id/status
 */
export const patchAdminWithdrawMethodStatus = async (req: Request, res: Response): Promise<any> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ status: false, msg: 'Invalid method id' });
  }

  const validated = adminWithdrawMethodStatusSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }

  try {
    const row = await setWithdrawMethodActive(id, validated.value.is_active as 0 | 1);
    if (!row) return res.status(404).json({ status: false, msg: 'Withdraw method not found' });
    return res.status(200).json({ status: true, msg: 'Status updated', data: row });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Update failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route PATCH /api/admin/transactions/withdraw-methods/:id/default
 */
export const patchAdminWithdrawMethodDefault = async (req: Request, res: Response): Promise<any> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ status: false, msg: 'Invalid method id' });
  }

  const validated = adminWithdrawMethodDefaultSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }

  try {
    const result = await setWithdrawMethodDefault(id, validated.value.is_default as 0 | 1);
    if (!result.ok && result.reason === 'not_found') {
      return res.status(404).json({ status: false, msg: 'Withdraw method not found' });
    }
    if (!result.ok && result.reason === 'cannot_unset') {
      return res.status(400).json({
        status: false,
        msg: 'Please set another method as default first',
      });
    }
    return res.status(200).json({ status: true, msg: 'Default method updated', data: result.data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Update failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route DELETE /api/admin/transactions/withdraw-methods/:id
 */
export const deleteAdminWithdrawMethod = async (req: Request, res: Response): Promise<any> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ status: false, msg: 'Invalid method id' });
  }

  try {
    const ok = await deleteWithdrawMethod(id);
    if (!ok) return res.status(404).json({ status: false, msg: 'Withdraw method not found' });
    return res.status(200).json({ status: true, msg: 'Withdraw method removed successfully' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Delete failed';
    return res.status(500).json({ status: false, msg });
  }
};
