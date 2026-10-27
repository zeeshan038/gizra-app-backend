import prisma from '../../../config/database';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'April', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export type YearlyChartMonth = {
  month: number;
  label: (typeof MONTH_LABELS)[number];
  earning: number;
  commission: number;
};

export type VendorDashboardYearlyChart = {
  months: YearlyChartMonth[];
  total_earning: number;
  total_commission: number;
};

type MonthlyRow = {
  month: number;
  earning: number;
  commission: number;
};

/**
 * Yearly bar chart — PHP Vendor\\DashboardController (OrderTransaction, current calendar year).
 */
export async function getVendorDashboardYearlyChart(vendorId: number): Promise<VendorDashboardYearlyChart> {
  const year = new Date().getFullYear();
  const from = new Date(year, 0, 1, 0, 0, 0, 0);
  const to = new Date(year, 11, 31, 23, 59, 59, 999);

  const rows = await prisma.$queryRaw<MonthlyRow[]>`
    SELECT
      EXTRACT(MONTH FROM created_at)::int AS month,
      COALESCE(SUM(restaurant_amount), 0)::double precision AS earning,
      COALESCE(SUM(admin_commission + COALESCE(admin_expense, 0)), 0)::double precision AS commission
    FROM order_transactions
    WHERE vendor_id = ${vendorId}
      AND created_at >= ${from}
      AND created_at <= ${to}
      AND (
        status NOT IN ('refunded_with_delivery_charge', 'refunded_without_delivery_charge')
        OR status IS NULL
      )
    GROUP BY EXTRACT(MONTH FROM created_at)
    ORDER BY month
  `;

  const byMonth = new Map<number, MonthlyRow>();
  for (const row of rows) {
    byMonth.set(Number(row.month), {
      month: Number(row.month),
      earning: Number(row.earning),
      commission: Number(row.commission),
    });
  }

  let total_earning = 0;
  let total_commission = 0;
  const months: YearlyChartMonth[] = MONTH_LABELS.map((label, index) => {
    const month = index + 1;
    const match = byMonth.get(month);
    const earning = match?.earning ?? 0;
    const commission = match?.commission ?? 0;
    total_earning += earning;
    total_commission += commission;
    return { month, label, earning, commission };
  });

  return {
    months,
    total_earning: roundMoney(total_earning),
    total_commission: roundMoney(total_commission),
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
