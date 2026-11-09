/**
 * Smoke tests for time window helpers (Asia/Jerusalem wall clock).
 * Run: npx ts-node scripts/test-delivery-distance-time-restriction.ts
 */
import assert from 'node:assert';
import {
  isNowWithinRestrictionWindow,
  parseTimeToMinutes,
  wallClockMinutesInZone,
} from '../src/utils/delivery/deliveryDistanceTimeRestriction';

const TZ = 'Asia/Jerusalem';

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`OK  ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`, e);
    process.exitCode = 1;
  }
}

// 2025-11-06 12:00 UTC ≈ 14:00 Israel standard – use fixed UTC instant and compare minutes in zone
const noonUtc = new Date('2025-06-15T12:00:00.000Z');

test('parse HH:mm', () => {
  assert.strictEqual(parseTimeToMinutes('16:30'), 16 * 60 + 30);
  assert.strictEqual(parseTimeToMinutes('0:00'), 0);
  assert.strictEqual(parseTimeToMinutes('23:59'), 23 * 60 + 59);
});

test('same-day window', () => {
  // 15 Jun 2025 12:00 UTC – wall clock in Jerusalem
  const d = new Date('2025-06-15T12:00:00.000Z');
  const m = wallClockMinutesInZone(d, TZ);
  assert.ok(m >= 0 && m < 1440);
  // Window 14:00–18:00 includes ~15:00 local depending on DST
  assert.strictEqual(isNowWithinRestrictionWindow(d, '14:00', '18:00', TZ), m >= 14 * 60 && m <= 18 * 60);
});

test('overnight window (wrap)', () => {
  const d = noonUtc;
  const m = wallClockMinutesInZone(d, TZ);
  const overnight = isNowWithinRestrictionWindow(d, '22:00', '06:00', TZ);
  const expectOvernight = m >= 22 * 60 || m <= 6 * 60;
  assert.strictEqual(overnight, expectOvernight);
});

console.log(process.exitCode === 1 ? 'Some tests failed' : 'All tests passed');
