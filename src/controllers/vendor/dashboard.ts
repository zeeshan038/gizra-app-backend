import { Request, Response } from 'express';
import { getVendorContext } from '../../utils/vendor/context';
import { dashboardOrderStatsQuerySchema } from '../../schemas/vendor/Dashboard';
import { getVendorDashboardOrderStats } from '../../utils/vendor/dashboard/orderStats';
import { getVendorDashboardYearlyChart } from '../../utils/vendor/dashboard/yearlyChart';
import { getVendorDashboardTopFoods } from '../../utils/vendor/dashboard/topFoods';

/**
 * @Description Dashboard order statistic cards (confirmed, cooking, etc.)
 * @Route GET /api/vendor/dashboard/order-stats
 * @Access Vendor
 * @Query statistics_type — overall | today | this_month (PHP dash_params)
 */
export const getDashboardOrderStats = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context not found for vendor' });
  }

  const validated = dashboardOrderStatsQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(', '),
    });
  }

  try {
    const { statistics_type } = validated.value as { statistics_type: 'overall' | 'today' | 'this_month' };
    const data = await getVendorDashboardOrderStats(ctx.restaurantId, statistics_type);
    return res.status(200).json({
      status: true,
      data: {
        statistics_type,
        ...data,
      },
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Yearly commission & earning chart (current calendar year)
 * @Route GET /api/vendor/dashboard/yearly-chart
 * @Access Vendor
 */
export const getDashboardYearlyChart = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context not found for vendor' });
  }

  try {
    const data = await getVendorDashboardYearlyChart(ctx.vendorId);
    return res.status(200).json({ status: true, data });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Top selling & top rated foods (6 each)
 * @Route GET /api/vendor/dashboard/top-foods
 * @Access Vendor
 */
export const getDashboardTopFoods = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context not found for vendor' });
  }

  try {
    const data = await getVendorDashboardTopFoods(ctx.restaurantId);
    return res.status(200).json({ status: true, data });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};
