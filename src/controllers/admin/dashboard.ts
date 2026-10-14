import { Request, Response } from 'express';
import { adminDashboardQuerySchema } from '../../schemas/admin/Dashboard';
import { getAdminDashboardData } from '../../utils/admin/dashboard/getAdminDashboard';
import { parseAdminZoneId } from '../../utils/admin/dashboard/zoneFilter';
import { AdminDashboardStatisticsType } from '../../utils/admin/dashboard/types';

/**
 * @Description Admin dashboard metrics (order stats, chart, rankings) — legacy PHP `DashboardController::dashboard_data()`.
 * @Route GET /api/admin/dashboard
 * @Access Admin JWT
 * @Query zone_id — `all` or numeric zone id
 * @Query statistics_type — overall | today | this_week | this_month | this_year
 * @Query user_overview — same values as statistics_type (user pie chart period)
 */
export const getAdminDashboard = async (req: Request, res: Response): Promise<any> => {
  const validated = adminDashboardQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(', '),
    });
  }

  const { zone_id, statistics_type, user_overview } = validated.value as {
    zone_id: string;
    statistics_type: AdminDashboardStatisticsType;
    user_overview: AdminDashboardStatisticsType;
  };

  const zoneId = parseAdminZoneId(zone_id);
  if (zoneId === null) {
    return res.status(400).json({ status: false, msg: 'Invalid zone_id' });
  }

  try {
    const data = await getAdminDashboardData({
      zoneId,
      statisticsType: statistics_type,
      userOverview: user_overview,
    });
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e: any) {
    console.error('[admin/dashboard]', e);
    return res.status(500).json({ status: false, msg: e.message ?? 'Something went wrong' });
  }
};
