import prisma from '../../../config/database';
import { VendorSetupActionError } from '../../../types/vendor/restaurantSetup';
import { formatTime, timeToDate, toMinutes } from './helpers';

export function validateScheduleTimes(
  start_time: string,
  end_time: string
): VendorSetupActionError | null {
  if (toMinutes(end_time) <= toMinutes(start_time)) {
    return { status: 400, msg: 'End time must be after the start time' };
  }
  return null;
}

export async function addRestaurantScheduleSlot(
  restaurantId: number,
  day: number,
  start_time: string,
  end_time: string
): Promise<VendorSetupActionError | null> {
  const timeError = validateScheduleTimes(start_time, end_time);
  if (timeError) return timeError;

  const existing = await prisma.restaurant_schedule.findMany({
    where: { restaurant_id: restaurantId, day },
  });
  const start = toMinutes(start_time);
  const end = toMinutes(end_time);
  const overlaps = existing.some((row) => {
    const open = toMinutes(formatTime(row.opening_time));
    const close = toMinutes(formatTime(row.closing_time));
    return start < close && end > open;
  });
  if (overlaps) return { status: 400, msg: 'Schedule overlaps an existing time slot' };

  await prisma.restaurant_schedule.create({
    data: {
      restaurant_id: restaurantId,
      day,
      opening_time: timeToDate(start_time),
      closing_time: timeToDate(end_time),
      created_at: new Date(),
      updated_at: new Date(),
    },
  });
  return null;
}

export async function removeRestaurantScheduleSlot(
  restaurantId: number,
  scheduleId: number
): Promise<VendorSetupActionError | null> {
  if (!scheduleId) return { status: 400, msg: 'Schedule not found' };

  const schedule = await prisma.restaurant_schedule.findFirst({
    where: { id: BigInt(scheduleId), restaurant_id: restaurantId },
  });
  if (!schedule) return { status: 404, msg: 'Schedule not found' };

  await prisma.restaurant_schedule.delete({ where: { id: schedule.id } });
  return null;
}
