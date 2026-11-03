import { formatVendorFoodTimeForApi } from '../vendor/catalog/foodDetailFields';
/** How the item relates to its configured selling window (consumer apps). */
export type FoodAvailabilityStatus =
  | 'all_day'
  | 'available'
  | 'not_yet_available'
  | 'time_ended';

export type FoodSellingTimeSnapshot = {
  available_time_starts: string | null;
  available_time_ends: string | null;
  is_available_now: boolean;
  availability_status: FoodAvailabilityStatus;
};

const ALL_DAY_START_MIN = 0;
const ALL_DAY_END_MIN = 23 * 60 + 59;

function foodTimeValueToMinutes(value: unknown): number | null {
  const formatted = formatVendorFoodTimeForApi(value);
  if (!formatted) return null;
  const [h, m, s] = formatted.split(':').map((p) => Number(p));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m + (Number.isFinite(s) ? Math.floor(s / 60) : 0);
}

export function minutesInTimeZone(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

function isConfiguredAllDayWindow(startMin: number | null, endMin: number | null): boolean {
  if (startMin == null && endMin == null) return true;
  if (startMin == null || endMin == null) return false;
  return startMin <= ALL_DAY_START_MIN && endMin >= ALL_DAY_END_MIN;
}

function isMinuteInsideWindow(nowMin: number, startMin: number, endMin: number): boolean {
  if (startMin === endMin) return nowMin === startMin;
  if (startMin < endMin) {
    return nowMin >= startMin && nowMin <= endMin;
  }
  // Overnight window (e.g. 22:00–06:00)
  return nowMin >= startMin || nowMin <= endMin;
}

export function resolveFoodSellingTime(
  starts: unknown,
  ends: unknown,
  at: Date,
  timeZone: string
): FoodSellingTimeSnapshot {
  const available_time_starts = formatVendorFoodTimeForApi(starts);
  const available_time_ends = formatVendorFoodTimeForApi(ends);
  const startMin = foodTimeValueToMinutes(starts);
  const endMin = foodTimeValueToMinutes(ends);

  if (isConfiguredAllDayWindow(startMin, endMin)) {
    return {
      available_time_starts,
      available_time_ends,
      is_available_now: true,
      availability_status: 'all_day',
    };
  }

  const effectiveStart = startMin ?? ALL_DAY_START_MIN;
  const effectiveEnd = endMin ?? ALL_DAY_END_MIN;
  const nowMin = minutesInTimeZone(at, timeZone);
  const inside = isMinuteInsideWindow(nowMin, effectiveStart, effectiveEnd);

  if (inside) {
    return {
      available_time_starts,
      available_time_ends,
      is_available_now: true,
      availability_status: 'available',
    };
  }

  let availability_status: FoodAvailabilityStatus = 'time_ended';
  if (effectiveStart < effectiveEnd) {
    availability_status = nowMin < effectiveStart ? 'not_yet_available' : 'time_ended';
  } else if (nowMin > effectiveEnd && nowMin < effectiveStart) {
    availability_status = 'not_yet_available';
  }

  return {
    available_time_starts,
    available_time_ends,
    is_available_now: false,
    availability_status,
  };
}

export function foodSellingTimeErrorMessage(snapshot: FoodSellingTimeSnapshot): string {
  if (snapshot.is_available_now) return '';
  if (snapshot.availability_status === 'not_yet_available') {
    const from = snapshot.available_time_starts?.slice(0, 5) ?? '';
    return from
      ? `This item is only available from ${from}`
      : 'This item is not available yet';
  }
  const until = snapshot.available_time_ends?.slice(0, 5) ?? '';
  return until
    ? `This item was only available until ${until}`
    : 'This item is no longer available at this time';
}
