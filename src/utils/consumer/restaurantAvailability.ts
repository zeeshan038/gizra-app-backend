import prisma from '../../config/database';
import { getBusinessSetting } from './businessSettings';
import { formatTime, toMinutes } from '../vendor/restaurantSetup/helpers';

export const CLOSES_SOON_MINUTES = 30;
export const OPENS_SOON_MINUTES = 30;

export type RestaurantAvailabilityStatus = 'OPEN' | 'CLOSES_SOON' | 'CLOSED' | 'OPENS_SOON';

export type WeeklyScheduleRow = {
  day: number;
  opening_time: Date | null;
  closing_time: Date | null;
};

export type RestaurantAvailability = {
  status: RestaurantAvailabilityStatus;
  can_order: boolean;
  next_open_at: string | null;
  next_close_at: string | null;
  is_temporarily_closed: boolean;
};

type ParsedSlot = { day: number; openMin: number; closeMin: number };

type Ymd = { year: number; month: number; day: number };

type OpenState =
  | { open: false }
  | {
      open: true;
      closeYmd: Ymd;
      closeMin: number;
    };

const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

let cachedDefaultTimeZone: string | null = null;

export async function getDefaultRestaurantTimeZone(): Promise<string> {
  if (cachedDefaultTimeZone) return cachedDefaultTimeZone;
  const tz = await getBusinessSetting('timezone');
  cachedDefaultTimeZone = tz?.trim() ? tz.trim() : 'Asia/Jerusalem';
  return cachedDefaultTimeZone;
}

export function closedAvailability(isTemporarilyClosed = false): RestaurantAvailability {
  return {
    status: 'CLOSED',
    can_order: false,
    next_open_at: null,
    next_close_at: null,
    is_temporarily_closed: isTemporarilyClosed,
  };
}

/** Fields for API responses; keeps legacy `open` aligned with `can_order`. */
export function restaurantAvailabilityResponseFields(
  availability: RestaurantAvailability
): RestaurantAvailability & { open: boolean } {
  return {
    ...availability,
    open: availability.can_order,
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function getLocalParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt
      .formatToParts(date)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value])
  );
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
  };
}

function weekdayInZone(date: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(date);
  return WEEKDAY_TO_INDEX[name] ?? 0;
}

function ymdInZone(date: Date, timeZone: string): Ymd {
  const p = getLocalParts(date, timeZone);
  return { year: p.year, month: p.month, day: p.day };
}

function minutesInZone(date: Date, timeZone: string): number {
  const p = getLocalParts(date, timeZone);
  return p.hour * 60 + p.minute;
}

function addDaysToYmd(ymd: Ymd, days: number): Ymd {
  const d = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day + days));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

function utcInstantFromLocal(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 4; i += 1) {
    const lp = getLocalParts(new Date(utcMs), timeZone);
    const desired = Date.UTC(year, month - 1, day, hour, minute);
    const actual = Date.UTC(lp.year, lp.month - 1, lp.day, lp.hour, lp.minute);
    utcMs += desired - actual;
  }
  return new Date(utcMs);
}

function formatOffset(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  }).formatToParts(instant);
  const raw = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const match = raw.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return '+00:00';
  const sign = match[1];
  const hh = match[2].padStart(2, '0');
  const mm = (match[3] ?? '00').padStart(2, '0');
  return `${sign}${hh}:${mm}`;
}

function formatIsoInTimeZone(instant: Date, timeZone: string): string {
  const p = getLocalParts(instant, timeZone);
  const offset = formatOffset(instant, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}:00${offset}`;
}

function parseSlots(schedules: WeeklyScheduleRow[]): ParsedSlot[] {
  const slots: ParsedSlot[] = [];
  for (const row of schedules) {
    const openStr = formatTime(row.opening_time);
    const closeStr = formatTime(row.closing_time);
    if (!openStr || !closeStr) continue;
    slots.push({
      day: row.day,
      openMin: toMinutes(openStr),
      closeMin: toMinutes(closeStr),
    });
  }
  return slots;
}

function resolveOpenState(now: Date, timeZone: string, slots: ParsedSlot[]): OpenState {
  if (!slots.length) return { open: false };

  const todayDow = weekdayInZone(now, timeZone);
  const prevDow = (todayDow + 6) % 7;
  const nowMin = minutesInZone(now, timeZone);
  const todayYmd = ymdInZone(now, timeZone);

  for (const slot of slots) {
    if (slot.day === prevDow && slot.openMin > slot.closeMin && nowMin < slot.closeMin) {
      return {
        open: true,
        closeYmd: todayYmd,
        closeMin: slot.closeMin,
      };
    }
  }

  for (const slot of slots) {
    if (slot.day !== todayDow) continue;
    if (slot.openMin <= slot.closeMin) {
      if (nowMin >= slot.openMin && nowMin < slot.closeMin) {
        return {
          open: true,
          closeYmd: todayYmd,
          closeMin: slot.closeMin,
        };
      }
    } else if (nowMin >= slot.openMin) {
      return {
        open: true,
        closeYmd: addDaysToYmd(todayYmd, 1),
        closeMin: slot.closeMin,
      };
    }
  }

  return { open: false };
}

function closeInstantFromState(state: Extract<OpenState, { open: true }>, timeZone: string): Date {
  const h = Math.floor(state.closeMin / 60);
  const m = state.closeMin % 60;
  return utcInstantFromLocal(
    state.closeYmd.year,
    state.closeYmd.month,
    state.closeYmd.day,
    h,
    m,
    timeZone
  );
}

function findNextOpenInstant(now: Date, timeZone: string, slots: ParsedSlot[]): Date | null {
  if (!slots.length) return null;

  const startYmd = ymdInZone(now, timeZone);
  const startDow = weekdayInZone(now, timeZone);
  const nowMin = minutesInZone(now, timeZone);

  for (let dayOffset = 0; dayOffset <= 7; dayOffset += 1) {
    const ymd = addDaysToYmd(startYmd, dayOffset);
    const dow = (startDow + dayOffset) % 7;
    const daySlots = slots
      .filter((s) => s.day === dow)
      .sort((a, b) => a.openMin - b.openMin);

    for (const slot of daySlots) {
      if (dayOffset === 0 && slot.openMin <= nowMin) continue;
      const h = Math.floor(slot.openMin / 60);
      const m = slot.openMin % 60;
      const instant = utcInstantFromLocal(ymd.year, ymd.month, ymd.day, h, m, timeZone);
      if (instant.getTime() > now.getTime() + 30_000) {
        return instant;
      }
    }
  }

  return null;
}

export function computeRestaurantAvailability(params: {
  active: boolean;
  schedules: WeeklyScheduleRow[];
  timeZone: string;
  now?: Date;
}): RestaurantAvailability {
  const now = params.now ?? new Date();
  const slots = parseSlots(params.schedules);
  const nextOpenInstant = findNextOpenInstant(now, params.timeZone, slots);
  const nextOpenAt =
    nextOpenInstant != null ? formatIsoInTimeZone(nextOpenInstant, params.timeZone) : null;

  if (!params.active) {
    return {
      status: 'CLOSED',
      can_order: false,
      next_open_at: nextOpenAt,
      next_close_at: null,
      is_temporarily_closed: true,
    };
  }

  if (!slots.length) {
    return closedAvailability(false);
  }

  const openState = resolveOpenState(now, params.timeZone, slots);

  if (openState.open) {
    const closeInstant = closeInstantFromState(openState, params.timeZone);
    const nextCloseAt = formatIsoInTimeZone(closeInstant, params.timeZone);
    const minutesUntilClose = (closeInstant.getTime() - now.getTime()) / 60_000;
    const closesSoon =
      minutesUntilClose > 0 && minutesUntilClose <= CLOSES_SOON_MINUTES + 1 / 60;

    return {
      status: closesSoon ? 'CLOSES_SOON' : 'OPEN',
      can_order: true,
      next_open_at: null,
      next_close_at: nextCloseAt,
      is_temporarily_closed: false,
    };
  }

  if (nextOpenInstant) {
    const minutesUntilOpen = (nextOpenInstant.getTime() - now.getTime()) / 60_000;
    const opensSoon =
      minutesUntilOpen > 0 && minutesUntilOpen <= OPENS_SOON_MINUTES + 1 / 60;
    return {
      status: opensSoon ? 'OPENS_SOON' : 'CLOSED',
      can_order: false,
      next_open_at: nextOpenAt,
      next_close_at: null,
      is_temporarily_closed: false,
    };
  }

  return {
    status: 'CLOSED',
    can_order: false,
    next_open_at: null,
    next_close_at: null,
    is_temporarily_closed: false,
  };
}

export async function loadWeeklySchedulesByRestaurantId(
  restaurantIds: bigint[]
): Promise<Map<string, WeeklyScheduleRow[]>> {
  const map = new Map<string, WeeklyScheduleRow[]>();
  if (!restaurantIds.length) return map;

  const idDecimals = restaurantIds.map((id) => Number(id));
  const rows = await prisma.restaurant_schedule.findMany({
    where: { restaurant_id: { in: idDecimals } },
    select: {
      restaurant_id: true,
      day: true,
      opening_time: true,
      closing_time: true,
    },
  });

  for (const row of rows) {
    const key = String(Number(row.restaurant_id));
    const list = map.get(key) ?? [];
    list.push({
      day: Number(row.day),
      opening_time: row.opening_time,
      closing_time: row.closing_time,
    });
    map.set(key, list);
  }

  return map;
}

export async function availabilityMapForRestaurants(
  rows: { id: bigint; active?: boolean | null }[]
): Promise<Map<string, RestaurantAvailability>> {
  const map = new Map<string, RestaurantAvailability>();
  if (!rows.length) return map;

  const [timeZone, scheduleMap] = await Promise.all([
    getDefaultRestaurantTimeZone(),
    loadWeeklySchedulesByRestaurantId(rows.map((r) => r.id)),
  ]);

  for (const row of rows) {
    const key = row.id.toString();
    map.set(
      key,
      computeRestaurantAvailability({
        active: row.active !== false,
        schedules: scheduleMap.get(key) ?? [],
        timeZone,
      })
    );
  }

  return map;
}

export async function computeAvailabilityForRestaurant(
  restaurantId: bigint,
  active: boolean
): Promise<RestaurantAvailability> {
  const [timeZone, scheduleMap] = await Promise.all([
    getDefaultRestaurantTimeZone(),
    loadWeeklySchedulesByRestaurantId([restaurantId]),
  ]);
  return computeRestaurantAvailability({
    active,
    schedules: scheduleMap.get(restaurantId.toString()) ?? [],
    timeZone,
  });
}
