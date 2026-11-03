import { Request, Response } from 'express';
import { adminReportListQuerySchema } from '../../schemas/admin/Report';
import {
  campaignOrderReportAdmin,
  disbursementReportAdmin,
  expenseReportAdmin,
  foodWiseReportAdmin,
  orderReportAdmin,
  transactionReportAdmin,
} from '../../utils/admin/reports/reportManagementUtils';
import { parseVendorReportListQuery } from '../../utils/admin/reports/reportQuery';
import { getVendorContext } from '../../utils/vendor/context';

/**
 * @Description Restaurant transaction report for logged-in vendor
 * @Route GET /api/vendor/reports/transaction
 * @Access Private (Vendor)
 */
export const vendorTransactionReport = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context required' });
  }
  const validated = adminReportListQuerySchema.validate(parseVendorReportListQuery(req), {
    stripUnknown: true,
    convert: true,
  });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const data = await transactionReportAdmin({
      ...validated.value,
      restaurant_id: ctx.restaurantId,
      vendor_id: ctx.vendorId,
    });
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e) {
    console.error('[vendor/reports/transaction]', e);
    return res.status(500).json({ status: false, msg: 'Failed to load transaction report' });
  }
};

/**
 * @Description Restaurant expense report for logged-in vendor
 * @Route GET /api/vendor/reports/expense
 * @Access Private (Vendor)
 */
export const vendorExpenseReport = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context required' });
  }
  const validated = adminReportListQuerySchema.validate(parseVendorReportListQuery(req), {
    stripUnknown: true,
    convert: true,
  });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const data = await expenseReportAdmin(
      { ...validated.value, restaurant_id: ctx.restaurantId, vendor_id: ctx.vendorId },
      'vendor'
    );
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e) {
    console.error('[vendor/reports/expense]', e);
    return res.status(500).json({ status: false, msg: 'Failed to load expense report' });
  }
};

/**
 * @Description Restaurant order report for logged-in vendor
 * @Route GET /api/vendor/reports/order
 * @Access Private (Vendor)
 */
export const vendorOrderReport = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context required' });
  }
  const validated = adminReportListQuerySchema.validate(parseVendorReportListQuery(req), {
    stripUnknown: true,
    convert: true,
  });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const data = await orderReportAdmin({
      ...validated.value,
      restaurant_id: ctx.restaurantId,
      vendor_id: ctx.vendorId,
    });
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e) {
    console.error('[vendor/reports/order]', e);
    return res.status(500).json({ status: false, msg: 'Failed to load order report' });
  }
};

/**
 * @Description Restaurant campaign order report for logged-in vendor
 * @Route GET /api/vendor/reports/campaign-order
 * @Access Private (Vendor)
 */
export const vendorCampaignOrderReport = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context required' });
  }
  const validated = adminReportListQuerySchema.validate(parseVendorReportListQuery(req), {
    stripUnknown: true,
    convert: true,
  });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const data = await campaignOrderReportAdmin({
      ...validated.value,
      restaurant_id: ctx.restaurantId,
      vendor_id: ctx.vendorId,
    });
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e) {
    console.error('[vendor/reports/campaign-order]', e);
    return res.status(500).json({ status: false, msg: 'Failed to load campaign order report' });
  }
};

/**
 * @Description Restaurant food-wise report for logged-in vendor
 * @Route GET /api/vendor/reports/food-wise
 * @Access Private (Vendor)
 */
export const vendorFoodWiseReport = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context required' });
  }
  const validated = adminReportListQuerySchema.validate(parseVendorReportListQuery(req), {
    stripUnknown: true,
    convert: true,
  });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const data = await foodWiseReportAdmin({
      ...validated.value,
      restaurant_id: ctx.restaurantId,
      vendor_id: ctx.vendorId,
    });
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e) {
    console.error('[vendor/reports/food-wise]', e);
    return res.status(500).json({ status: false, msg: 'Failed to load food-wise report' });
  }
};

/**
 * @Description Restaurant disbursement report for logged-in vendor
 * @Route GET /api/vendor/reports/disbursement
 * @Access Private (Vendor)
 */
export const vendorDisbursementReport = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context required' });
  }
  const validated = adminReportListQuerySchema.validate(parseVendorReportListQuery(req), {
    stripUnknown: true,
    convert: true,
  });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const data = await disbursementReportAdmin(
      { ...validated.value, restaurant_id: ctx.restaurantId, vendor_id: ctx.vendorId },
      'restaurant'
    );
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e) {
    console.error('[vendor/reports/disbursement]', e);
    return res.status(500).json({ status: false, msg: 'Failed to load disbursement report' });
  }
};
