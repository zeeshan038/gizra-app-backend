/**
 * Unit tests for Early Close / Temporary Restaurant Pause (availability engine).
 *
 * Usage:
 *   npx ts-node scripts/test-restaurant-temporary-pause.ts
 */
import {
  computeRestaurantAvailability,
  isScheduleAtWithinTimedPause,
  isTimedPauseActive,
  resolveCurrentShiftCloseInstant,
  restaurantAvailabilityResponseFields,
  type WeeklyScheduleRow,
} from '../src/utils/consumer/restaurantAvailability';

const TZ = 'Asia/Jerusalem';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function slot(day: number, openH: number, openM: number, closeH: number, closeM: number): WeeklyScheduleRow {
  const opening_time = new Date(Date.UTC(1970, 0, 1, openH, openM, 0));
  const closing_time = new Date(Date.UTC(1970, 0, 1, closeH, closeM, 0));
  return { day, opening_time, closing_time };
}

/** Wednesday 2024-06-12 14:00 Asia/Jerusalem (UTC+3 in June). */
function wedAfternoon(): Date {
  return new Date('2024-06-12T11:00:00.000Z'); // 14:00 IDT
}

/** Wednesday 2024-06-12 23:30 Asia/Jerusalem. */
function wedLate(): Date {
  return new Date('2024-06-12T20:30:00.000Z'); // 23:30 IDT
}

/** Thursday 01:00 Asia/Jerusalem — overnight from Wed. */
function thuEarly(): Date {
  return new Date('2024-06-12T22:00:00.000Z'); // 01:00 IDT Thu
}

function run(): void {
  const wed = 3; // Wednesday
  const schedules = [slot(wed, 10, 0, 22, 0)];
  const overnight = [slot(wed, 18, 0, 2, 0)]; // 18:00 → 02:00 next day

  // 1) Normal open
  {
    const a = computeRestaurantAvailability({
      active: true,
      schedules,
      timeZone: TZ,
      now: wedAfternoon(),
    });
    assert(a.can_order === true, 'normal open can_order');
    assert(a.status === 'OPEN' || a.status === 'CLOSES_SOON', 'normal open status');
    assert(a.is_temporarily_closed === false, 'not temp closed');
    assert(a.paused_until === null && a.pause_type === null, 'no pause fields when open');
    const fields = restaurantAvailabilityResponseFields(a);
    assert(fields.open === fields.can_order, 'legacy open alias');
  }

  // 2) PAUSE_30 / PAUSE_60 blocks ordering
  {
    const pauseUntil = new Date(wedAfternoon().getTime() + 30 * 60_000);
    const a = computeRestaurantAvailability({
      active: true,
      schedules,
      timeZone: TZ,
      now: wedAfternoon(),
      paused_until: pauseUntil,
      pause_message: 'Busy',
      pause_type: 'PAUSE_30',
    });
    assert(a.can_order === false, 'pause_30 blocks');
    assert(a.is_temporarily_closed === true, 'pause_30 temp closed');
    assert(a.pause_type === 'PAUSE_30', 'pause_type exposed');
    assert(a.pause_message === 'Busy', 'pause_message exposed');
    assert(a.paused_until != null, 'paused_until exposed');
    assert(a.next_open_at != null, 'next_open_at after pause');
  }

  // 3) Expired pause ignored
  {
    const expired = new Date(wedAfternoon().getTime() - 60_000);
    const a = computeRestaurantAvailability({
      active: true,
      schedules,
      timeZone: TZ,
      now: wedAfternoon(),
      paused_until: expired,
      pause_message: 'Old',
      pause_type: 'PAUSE_60',
    });
    assert(a.can_order === true, 'expired pause does not block');
    assert(a.is_temporarily_closed === false, 'expired not temp closed');
    assert(a.pause_message === null && a.pause_type === null, 'expired fields cleared in response');
    assert(isTimedPauseActive(expired, wedAfternoon()) === false, 'isTimedPauseActive false');
  }

  // 4) Early close rest-of-shift semantics via paused_until = shift close
  {
    const closeAt = resolveCurrentShiftCloseInstant(schedules, TZ, wedAfternoon());
    assert(closeAt != null, 'shift close resolved while open');
    const a = computeRestaurantAvailability({
      active: true,
      schedules,
      timeZone: TZ,
      now: wedAfternoon(),
      paused_until: closeAt,
      pause_type: 'EARLY_CLOSE',
      pause_message: 'Closing early',
    });
    assert(a.can_order === false, 'early close blocks');
    assert(a.pause_type === 'EARLY_CLOSE', 'early close type');
  }

  // 5) Indefinite active=false still works; expired pause fields ignored
  {
    const a = computeRestaurantAvailability({
      active: false,
      schedules,
      timeZone: TZ,
      now: wedAfternoon(),
      paused_until: new Date(wedAfternoon().getTime() - 1000),
      pause_type: 'PAUSE_30',
      pause_message: 'gone',
    });
    assert(a.can_order === false, 'active false blocks');
    assert(a.is_temporarily_closed === true, 'active false temp closed');
    assert(a.pause_type === null, 'expired pause not shown with active false');
  }

  // 6) Overnight shift open after midnight
  {
    const a = computeRestaurantAvailability({
      active: true,
      schedules: overnight,
      timeZone: TZ,
      now: thuEarly(),
    });
    assert(a.can_order === true, 'overnight open after midnight');
  }

  // 7) Overnight early-close close instant
  {
    const closeAt = resolveCurrentShiftCloseInstant(overnight, TZ, wedLate());
    assert(closeAt != null, 'overnight close while open late');
    // close should be Thursday ~02:00 local
    const a = computeRestaurantAvailability({
      active: true,
      schedules: overnight,
      timeZone: TZ,
      now: wedLate(),
      paused_until: closeAt,
      pause_type: 'EARLY_CLOSE',
    });
    assert(a.can_order === false, 'overnight early close blocks');
  }

  // 8) Scheduled order within / outside pause
  {
    const pauseUntil = new Date(wedAfternoon().getTime() + 45 * 60_000);
    const inside = new Date(wedAfternoon().getTime() + 20 * 60_000);
    const outside = new Date(wedAfternoon().getTime() + 90 * 60_000);
    assert(
      isScheduleAtWithinTimedPause(inside, pauseUntil, wedAfternoon()) === true,
      'schedule inside pause rejected'
    );
    assert(
      isScheduleAtWithinTimedPause(outside, pauseUntil, wedAfternoon()) === false,
      'schedule outside pause allowed'
    );
    assert(
      isScheduleAtWithinTimedPause(inside, null, wedAfternoon()) === false,
      'no pause → schedule allowed'
    );
  }

  // 9) Outside weekly hours (not temporary)
  {
    const a = computeRestaurantAvailability({
      active: true,
      schedules,
      timeZone: TZ,
      now: new Date('2024-06-12T04:00:00.000Z'), // 07:00 IDT before open
    });
    assert(a.can_order === false, 'before hours closed');
    assert(a.is_temporarily_closed === false, 'hours closed is not temporary');
  }

  console.log('OK: restaurant temporary pause unit tests passed');
}

run();
