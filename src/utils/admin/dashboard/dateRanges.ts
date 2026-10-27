import { AdminDashboardStatisticsType } from './types';

type DateTimeField =
  | 'created_at'
  | 'accepted'
  | 'processing'
  | 'picked_up'
  | 'delivered'
  | 'canceled'
  | 'refund_requested'
  | 'refunded';

export type DateRange = { gte: Date; lte: Date };

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Laravel/Carbon default week (Monday start). */
function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function endOfWeek(d: Date): Date {
  const start = startOfWeek(d);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return endOfDay(end);
}

export function resolveStatisticsDateRange(
  statisticsType: AdminDashboardStatisticsType,
  now = new Date()
): DateRange | null {
  if (statisticsType === 'overall') return null;

  if (statisticsType === 'today') {
    return { gte: startOfDay(now), lte: endOfDay(now) };
  }

  if (statisticsType === 'this_week') {
    return { gte: startOfWeek(now), lte: endOfWeek(now) };
  }

  if (statisticsType === 'this_month') {
    return {
      gte: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
      lte: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
    };
  }

  // this_year
  return {
    gte: new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0),
    lte: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
  };
}

export function dateFilterOnField(
  field: DateTimeField,
  statisticsType: AdminDashboardStatisticsType,
  now = new Date()
): Partial<Record<DateTimeField, DateRange>> {
  const range = resolveStatisticsDateRange(statisticsType, now);
  if (!range) return {};
  return { [field]: range };
}
