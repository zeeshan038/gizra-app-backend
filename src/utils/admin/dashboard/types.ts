export const ADMIN_DASHBOARD_STATISTICS_TYPES = [
  'overall',
  'today',
  'this_year',
  'this_month',
  'this_week',
] as const;

export type AdminDashboardStatisticsType = (typeof ADMIN_DASHBOARD_STATISTICS_TYPES)[number];

export type AdminDashboardZoneId = 'all' | number;

export type AdminOrderStats = {
  searching_for_dm: number;
  accepted_by_dm: number;
  preparing_in_rs: number;
  picked_up: number;
  delivered: number;
  canceled: number;
  /** Legacy PHP key: overall = payment failed (`failed`); filtered periods = `refund_requested` status. */
  refund_requested: number;
  refunded: number;
};

export type AdminUserOverview = {
  total: number;
  customer: number;
  restaurant: number;
  delivery_man: number;
};

export type AdminMonthlyChartPoint = {
  month: string;
  commission: number;
  sell: number;
};

export type AdminDashboardPayload = {
  orderStats: AdminOrderStats;
  totals: {
    commission: number;
    total_sell: number;
  };
  monthlyChart: AdminMonthlyChartPoint[];
  userOverview: AdminUserOverview;
  popularRestaurants: Array<{ id: number; name: string; count: number; logo: string | null }>;
  topDeliveryman: Array<{ id: number; name: string; orders: number; image: string | null }>;
  topRestaurants: Array<{ id: number; name: string; orders: number; logo: string | null }>;
  topRatedFoods: Array<{ id: number; name: string; rating: number; reviews: number; image: string | null }>;
  topSellingFoods: Array<{ id: number; name: string; sold: number; image: string | null }>;
};
