import { AdminDashboardStatisticsType, AdminDashboardPayload, AdminDashboardZoneId } from './types';
import { getAdminDashboardOrderStats } from './orderStats';
import { getAdminDashboardUserOverview } from './userOverview';
import { getAdminDashboardYearlyChart } from './yearlyChart';
import { getAdminDashboardRankings } from './rankings';

export type AdminDashboardQuery = {
  zoneId: AdminDashboardZoneId;
  statisticsType: AdminDashboardStatisticsType;
  userOverview: AdminDashboardStatisticsType;
};

export async function getAdminDashboardData(query: AdminDashboardQuery): Promise<AdminDashboardPayload> {
  const { zoneId, statisticsType, userOverview } = query;

  const [orderStats, userOverviewData, chart, rankings] = await Promise.all([
    getAdminDashboardOrderStats(zoneId, statisticsType),
    getAdminDashboardUserOverview(zoneId, userOverview),
    getAdminDashboardYearlyChart(zoneId),
    getAdminDashboardRankings(zoneId),
  ]);

  return {
    orderStats,
    totals: chart.totals,
    monthlyChart: chart.monthlyChart,
    userOverview: userOverviewData,
    popularRestaurants: rankings.popularRestaurants,
    topDeliveryman: rankings.topDeliveryman,
    topRestaurants: rankings.topRestaurants,
    topRatedFoods: rankings.topRatedFoods,
    topSellingFoods: rankings.topSellingFoods,
  };
}
