import { Request, Response } from 'express';
import {
  adminCustomerWalletReportQuerySchema,
  adminReportListQuerySchema,
} from '../../schemas/admin/Report';
import { loyaltyReportAdmin } from '../../utils/admin/customers/loyaltyReportAdmin';
import { walletReportAdmin } from '../../utils/admin/customers/walletReportAdmin';
import {
  campaignOrderReportAdmin,
  disbursementReportAdmin,
  expenseReportAdmin,
  foodWiseReportAdmin,
  orderReportAdmin,
  restaurantReportAdmin,
  subscriptionReportAdmin,
  transactionReportAdmin,
} from '../../utils/admin/reports/reportManagementUtils';
import { parseAdminReportListQuery } from '../../utils/admin/reports/reportQuery';

/**
 * @Description Admin transaction report (order transactions, earnings summary)
 * @Route GET /api/admin/reports/transaction
 * @Access Private (Admin)
 */
export const adminTransactionReport = async (req: Request, res: Response): Promise<any> => {
  const validated = adminReportListQuerySchema.validate(parseAdminReportListQuery(req), {
    stripUnknown: true,
    convert: true,
  });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const data = await transactionReportAdmin(validated.value);
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e) {
    console.error('[admin/reports/transaction]', e);
    return res.status(500).json({ status: false, msg: 'Failed to load transaction report' });
  }
};

/**
 * @Description Admin expense report
 * @Route GET /api/admin/reports/expense
 * @Access Private (Admin)
 */
export const adminExpenseReport = async (req: Request, res: Response): Promise<any> => {
  const validated = adminReportListQuerySchema.validate(parseAdminReportListQuery(req), {
    stripUnknown: true,
    convert: true,
  });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const data = await expenseReportAdmin(validated.value, 'admin');
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e) {
    console.error('[admin/reports/expense]', e);
    return res.status(500).json({ status: false, msg: 'Failed to load expense report' });
  }
};

/**
 * @Description Admin order report
 * @Route GET /api/admin/reports/order
 * @Access Private (Admin)
 */
export const adminOrderReport = async (req: Request, res: Response): Promise<any> => {
  const validated = adminReportListQuerySchema.validate(parseAdminReportListQuery(req), {
    stripUnknown: true,
    convert: true,
  });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const data = await orderReportAdmin(validated.value);
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e) {
    console.error('[admin/reports/order]', e);
    return res.status(500).json({ status: false, msg: 'Failed to load order report' });
  }
};

/**
 * @Description Admin campaign order report
 * @Route GET /api/admin/reports/campaign-order
 * @Access Private (Admin)
 */
export const adminCampaignOrderReport = async (req: Request, res: Response): Promise<any> => {
  const validated = adminReportListQuerySchema.validate(parseAdminReportListQuery(req), {
    stripUnknown: true,
    convert: true,
  });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const data = await campaignOrderReportAdmin(validated.value);
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e) {
    console.error('[admin/reports/campaign-order]', e);
    return res.status(500).json({ status: false, msg: 'Failed to load campaign order report' });
  }
};

/**
 * @Description Admin food-wise sales report
 * @Route GET /api/admin/reports/food-wise
 * @Access Private (Admin)
 */
export const adminFoodWiseReport = async (req: Request, res: Response): Promise<any> => {
  const validated = adminReportListQuerySchema.validate(parseAdminReportListQuery(req), {
    stripUnknown: true,
    convert: true,
  });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const data = await foodWiseReportAdmin(validated.value);
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e) {
    console.error('[admin/reports/food-wise]', e);
    return res.status(500).json({ status: false, msg: 'Failed to load food-wise report' });
  }
};

/**
 * @Description Admin restaurant summary report
 * @Route GET /api/admin/reports/restaurant
 * @Access Private (Admin)
 */
export const adminRestaurantReport = async (req: Request, res: Response): Promise<any> => {
  const validated = adminReportListQuerySchema.validate(parseAdminReportListQuery(req), {
    stripUnknown: true,
    convert: true,
  });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const data = await restaurantReportAdmin(validated.value);
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e) {
    console.error('[admin/reports/restaurant]', e);
    return res.status(500).json({ status: false, msg: 'Failed to load restaurant report' });
  }
};

/**
 * @Description Admin subscription transactions report
 * @Route GET /api/admin/reports/subscription
 * @Access Private (Admin)
 */
export const adminSubscriptionReport = async (req: Request, res: Response): Promise<any> => {
  const validated = adminReportListQuerySchema.validate(parseAdminReportListQuery(req), {
    stripUnknown: true,
    convert: true,
  });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const data = await subscriptionReportAdmin(validated.value);
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e) {
    console.error('[admin/reports/subscription]', e);
    return res.status(500).json({ status: false, msg: 'Failed to load subscription report' });
  }
};

/**
 * @Description Admin disbursement report for restaurants
 * @Route GET /api/admin/reports/disbursement/restaurant
 * @Access Private (Admin)
 */
export const adminDisbursementRestaurantReport = async (req: Request, res: Response): Promise<any> => {
  const validated = adminReportListQuerySchema.validate(parseAdminReportListQuery(req), {
    stripUnknown: true,
    convert: true,
  });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const data = await disbursementReportAdmin(validated.value, 'restaurant');
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e) {
    console.error('[admin/reports/disbursement/restaurant]', e);
    return res.status(500).json({ status: false, msg: 'Failed to load disbursement report' });
  }
};

/**
 * @Description Admin disbursement report for delivery men
 * @Route GET /api/admin/reports/disbursement/delivery-man
 * @Access Private (Admin)
 */
export const adminDisbursementDeliveryManReport = async (req: Request, res: Response): Promise<any> => {
  const validated = adminReportListQuerySchema.validate(parseAdminReportListQuery(req), {
    stripUnknown: true,
    convert: true,
  });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const data = await disbursementReportAdmin(validated.value, 'delivery_man');
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e) {
    console.error('[admin/reports/disbursement/delivery-man]', e);
    return res.status(500).json({ status: false, msg: 'Failed to load disbursement report' });
  }
};

/**
 * @Description Customer wallet transaction report
 * @Route GET /api/admin/reports/customer-wallet
 * @Access Private (Admin)
 */
export const adminCustomerWalletReport = async (req: Request, res: Response): Promise<any> => {
  const validated = adminCustomerWalletReportQuerySchema.validate(
    {
      from: req.query.from,
      to: req.query.to,
      transaction_type: req.query.transaction_type,
      customer_id: req.query.customer_id ? Number(req.query.customer_id) : undefined,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 25,
    },
    { stripUnknown: true }
  );
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const data = await walletReportAdmin(validated.value);
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e) {
    console.error('[admin/reports/customer-wallet]', e);
    return res.status(500).json({ status: false, msg: 'Failed to load wallet report' });
  }
};

/**
 * @Description Customer loyalty point report
 * @Route GET /api/admin/reports/customer-loyalty
 * @Access Private (Admin)
 */
export const adminCustomerLoyaltyReport = async (req: Request, res: Response): Promise<any> => {
  const validated = adminCustomerWalletReportQuerySchema.validate(
    {
      from: req.query.from,
      to: req.query.to,
      transaction_type: req.query.transaction_type,
      customer_id: req.query.customer_id ? Number(req.query.customer_id) : undefined,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 25,
    },
    { stripUnknown: true }
  );
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const data = await loyaltyReportAdmin({
      ...validated.value,
      search: req.query.search ? String(req.query.search) : undefined,
    });
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e) {
    console.error('[admin/reports/customer-loyalty]', e);
    return res.status(500).json({ status: false, msg: 'Failed to load loyalty report' });
  }
};
