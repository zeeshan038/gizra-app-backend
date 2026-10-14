import prisma from '../../../config/database';
import { AdminDashboardZoneId, AdminMonthlyChartPoint } from './types';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

type MonthlyRow = {
  month: number;
  sell: number;
  commission: number;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Monthly commission & total sell for the current calendar year — PHP admin dashboard graph.
 */
export async function getAdminDashboardYearlyChart(zoneId: AdminDashboardZoneId): Promise<{
  monthlyChart: AdminMonthlyChartPoint[];
  totals: { commission: number; total_sell: number };
}> {
  const year = new Date().getFullYear();
  const from = new Date(year, 0, 1, 0, 0, 0, 0);
  const to = new Date(year, 11, 31, 23, 59, 59, 999);

  const zoneFilter =
    zoneId === 'all'
      ? prisma.$queryRaw<MonthlyRow[]>`
          SELECT
            EXTRACT(MONTH FROM created_at)::int AS month,
            COALESCE(SUM(order_amount), 0)::double precision AS sell,
            COALESCE(
              SUM(admin_commission + COALESCE(admin_expense, 0)),
              0
            )::double precision AS commission
          FROM order_transactions
          WHERE created_at >= ${from}
            AND created_at <= ${to}
            AND (
              status NOT IN ('refunded_with_delivery_charge', 'refunded_without_delivery_charge')
              OR status IS NULL
            )
          GROUP BY EXTRACT(MONTH FROM created_at)
          ORDER BY month
        `
      : prisma.$queryRaw<MonthlyRow[]>`
          SELECT
            EXTRACT(MONTH FROM created_at)::int AS month,
            COALESCE(SUM(order_amount), 0)::double precision AS sell,
            COALESCE(
              SUM(admin_commission + COALESCE(admin_expense, 0)),
              0
            )::double precision AS commission
          FROM order_transactions
          WHERE zone_id = ${zoneId}
            AND created_at >= ${from}
            AND created_at <= ${to}
            AND (
              status NOT IN ('refunded_with_delivery_charge', 'refunded_without_delivery_charge')
              OR status IS NULL
            )
          GROUP BY EXTRACT(MONTH FROM created_at)
          ORDER BY month
        `;

  const rows = await zoneFilter;
  const byMonth = new Map<number, MonthlyRow>();
  for (const row of rows) {
    byMonth.set(Number(row.month), {
      month: Number(row.month),
      sell: Number(row.sell),
      commission: Number(row.commission),
    });
  }

  let total_sell = 0;
  let commission = 0;

  const monthlyChart: AdminMonthlyChartPoint[] = MONTH_LABELS.map((month, index) => {
    const match = byMonth.get(index + 1);
    const sell = match?.sell ?? 0;
    const comm = match?.commission ?? 0;
    total_sell += sell;
    commission += comm;
    return {
      month,
      sell: roundMoney(sell),
      commission: roundMoney(comm),
    };
  });

  return {
    monthlyChart,
    totals: {
      total_sell: roundMoney(total_sell),
      commission: roundMoney(commission),
    },
  };
}
