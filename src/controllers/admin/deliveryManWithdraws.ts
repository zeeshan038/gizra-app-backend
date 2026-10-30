import { Request, Response } from 'express';
import {
  adminRestaurantWithdrawListQuerySchema,
  adminRestaurantWithdrawStatusSchema,
} from '../../schemas/admin/RestaurantWithdraw';
import {
  getDeliveryManWithdrawRequest,
  listDeliveryManWithdrawRequests,
  updateDeliveryManWithdrawStatus,
} from '../../utils/admin/withdraw/deliveryManWithdraw';

/**
 * @Route GET /api/admin/transactions/delivery-man-withdraws
 */
export const listAdminDeliveryManWithdraws = async (req: Request, res: Response): Promise<any> => {
  const validated = adminRestaurantWithdrawListQuerySchema.validate(req.query, {
    stripUnknown: true,
  });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }

  try {
    const result = await listDeliveryManWithdrawRequests(validated.value);
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
 * @Route GET /api/admin/transactions/delivery-man-withdraws/:id
 */
export const getAdminDeliveryManWithdraw = async (req: Request, res: Response): Promise<any> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ status: false, msg: 'Invalid withdraw id' });
  }

  try {
    const row = await getDeliveryManWithdrawRequest(id);
    if (!row) return res.status(404).json({ status: false, msg: 'Withdraw request not found' });
    return res.status(200).json({ status: true, data: row });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Fetch failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route PATCH /api/admin/transactions/delivery-man-withdraws/:id/status
 */
export const patchAdminDeliveryManWithdrawStatus = async (
  req: Request,
  res: Response
): Promise<any> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ status: false, msg: 'Invalid withdraw id' });
  }

  const validated = adminRestaurantWithdrawStatusSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }

  const adminId = req.user?.id ? Number(req.user.id) : null;
  const result = await updateDeliveryManWithdrawStatus(
    id,
    validated.value.approved,
    validated.value.note,
    Number.isFinite(adminId as number) ? adminId : null
  );

  if (!result.ok) {
    return res.status(result.status ?? 400).json({ status: false, msg: result.msg });
  }

  return res.status(200).json({
    status: true,
    msg:
      validated.value.approved === 1
        ? 'Withdraw request approved — payment recorded'
        : 'Withdraw request denied',
  });
};
