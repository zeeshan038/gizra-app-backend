import { Request, Response } from 'express';
import Joi from 'joi';
import {
  getMerchantInquiryAlert,
  listMerchantInquiries,
  markAllMerchantInquiriesSeen,
  markMerchantInquirySeen,
} from '../../utils/admin/merchantInquiries/service';

const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(100).optional(),
  unseen_only: Joi.string().valid('0', '1', 'true', 'false').optional(),
});

/**
 * @Route GET /api/admin/merchant-inquiries/alert
 */
export const getAdminMerchantInquiryAlertHandler = async (_req: Request, res: Response): Promise<any> => {
  try {
    const data = await getMerchantInquiryAlert();
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Alert failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route GET /api/admin/merchant-inquiries
 */
export const listAdminMerchantInquiriesHandler = async (req: Request, res: Response): Promise<any> => {
  const validated = listQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  const rawUnseen = validated.value.unseen_only;
  const unseen_only =
    rawUnseen === '1' || rawUnseen === 'true' ? true : rawUnseen === '0' || rawUnseen === 'false' ? false : undefined;

  try {
    const data = await listMerchantInquiries({
      page: validated.value.page,
      limit: validated.value.limit,
      unseen_only,
    });
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'List failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route PATCH /api/admin/merchant-inquiries/:id/seen
 */
export const markAdminMerchantInquirySeenHandler = async (req: Request, res: Response): Promise<any> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ status: false, msg: 'Invalid id' });
  }
  try {
    const ok = await markMerchantInquirySeen(id);
    if (!ok) {
      return res.status(404).json({ status: false, msg: 'Not found' });
    }
    return res.status(200).json({ status: true, msg: 'Marked as seen' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Update failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route POST /api/admin/merchant-inquiries/mark-all-seen
 */
export const markAllAdminMerchantInquiriesSeenHandler = async (_req: Request, res: Response): Promise<any> => {
  try {
    const count = await markAllMerchantInquiriesSeen();
    return res.status(200).json({ status: true, msg: 'Success', data: { marked: count } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Update failed';
    return res.status(500).json({ status: false, msg });
  }
};
