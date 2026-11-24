import prisma from '../../../config/database';
import {
  computeAvailabilityForRestaurant,
  getDefaultRestaurantTimeZone,
  isTimedPauseActive,
  loadWeeklySchedulesByRestaurantId,
  resolveCurrentShiftCloseInstant,
  restaurantAvailabilityResponseFields,
  type RestaurantPauseType,
} from '../../consumer/restaurantAvailability';
import { publishRestaurantAvailabilityChanged } from '../../../sockets/publish';

export const PAUSE_MESSAGE_MAX_LENGTH = 255;

export const PAUSE_MESSAGE_PRESETS: Record<string, string> = {
  busy: 'We are currently busy. Please try again shortly.',
  break: 'Taking a short break. Back soon!',
  early_close: 'We closed early for today. See you next shift!',
  kitchen: 'Kitchen temporarily unavailable. Back soon!',
};

export type TemporaryPauseState = {
  is_paused: boolean;
  pause_type: RestaurantPauseType | null;
  paused_until: string | null;
  pause_message: string | null;
  active: boolean;
  availability: ReturnType<typeof restaurantAvailabilityResponseFields>;
};

function resolvePauseMessage(input: {
  message?: string | null;
  message_preset?: string | null;
}): string | null {
  const custom = input.message?.trim();
  if (custom) return custom.slice(0, PAUSE_MESSAGE_MAX_LENGTH);

  const presetKey = input.message_preset?.trim().toLowerCase();
  if (presetKey && PAUSE_MESSAGE_PRESETS[presetKey]) {
    return PAUSE_MESSAGE_PRESETS[presetKey];
  }
  return null;
}

async function emitAvailabilityChanged(restaurantId: bigint): Promise<void> {
  const restaurant = await prisma.restaurants.findUnique({
    where: { id: restaurantId },
    select: {
      id: true,
      active: true,
      paused_until: true,
      pause_message: true,
      pause_type: true,
    },
  });
  if (!restaurant) return;

  const availability = await computeAvailabilityForRestaurant(
    restaurant.id,
    restaurant.active,
    {
      paused_until: restaurant.paused_until,
      pause_message: restaurant.pause_message,
      pause_type: restaurant.pause_type,
    }
  );
  const fields = restaurantAvailabilityResponseFields(availability);

  publishRestaurantAvailabilityChanged({
    restaurant_id: Number(restaurant.id),
    ...fields,
    updated_at: new Date().toISOString(),
  });
}

export async function getRestaurantTemporaryPause(
  restaurantId: bigint
): Promise<TemporaryPauseState> {
  const restaurant = await prisma.restaurants.findUnique({
    where: { id: restaurantId },
    select: {
      id: true,
      active: true,
      paused_until: true,
      pause_message: true,
      pause_type: true,
    },
  });
  if (!restaurant) {
    throw Object.assign(new Error('Restaurant not found'), { statusCode: 404 });
  }

  const availability = await computeAvailabilityForRestaurant(
    restaurant.id,
    restaurant.active,
    {
      paused_until: restaurant.paused_until,
      pause_message: restaurant.pause_message,
      pause_type: restaurant.pause_type,
    }
  );
  const fields = restaurantAvailabilityResponseFields(availability);
  const timed = isTimedPauseActive(restaurant.paused_until);

  return {
    is_paused: timed,
    pause_type: timed ? fields.pause_type : null,
    paused_until: timed ? fields.paused_until : null,
    pause_message: timed ? fields.pause_message : null,
    active: restaurant.active,
    availability: fields,
  };
}

export async function applyRestaurantTemporaryPause(
  restaurantId: bigint,
  input: {
    pause_type: RestaurantPauseType;
    message?: string | null;
    message_preset?: string | null;
  }
): Promise<TemporaryPauseState> {
  const now = new Date();
  const timeZone = await getDefaultRestaurantTimeZone();
  const scheduleMap = await loadWeeklySchedulesByRestaurantId([restaurantId]);
  const schedules = scheduleMap.get(restaurantId.toString()) ?? [];

  let pausedUntil: Date;
  if (input.pause_type === 'PAUSE_30') {
    pausedUntil = new Date(now.getTime() + 30 * 60_000);
  } else if (input.pause_type === 'PAUSE_60') {
    pausedUntil = new Date(now.getTime() + 60 * 60_000);
  } else {
    const closeInstant = resolveCurrentShiftCloseInstant(schedules, timeZone, now);
    if (!closeInstant || closeInstant.getTime() <= now.getTime() + 30_000) {
      throw Object.assign(
        new Error(
          'Early close is only available during an active operating shift with remaining time'
        ),
        { statusCode: 400 }
      );
    }
    pausedUntil = closeInstant;
  }

  const pauseMessage = resolvePauseMessage(input);

  await prisma.restaurants.update({
    where: { id: restaurantId },
    data: {
      paused_until: pausedUntil,
      pause_message: pauseMessage,
      pause_type: input.pause_type,
      updated_at: now,
    },
  });

  await emitAvailabilityChanged(restaurantId);
  return getRestaurantTemporaryPause(restaurantId);
}

/** Clears timed pause fields only — does not change `active` or `status`. */
export async function cancelRestaurantTemporaryPause(
  restaurantId: bigint
): Promise<TemporaryPauseState> {
  await prisma.restaurants.update({
    where: { id: restaurantId },
    data: {
      paused_until: null,
      pause_message: null,
      pause_type: null,
      updated_at: new Date(),
    },
  });

  await emitAvailabilityChanged(restaurantId);
  return getRestaurantTemporaryPause(restaurantId);
}

/** Emit after indefinite active toggle so clients stay in sync. */
export async function emitRestaurantActiveAvailabilityChanged(
  restaurantId: bigint
): Promise<void> {
  await emitAvailabilityChanged(restaurantId);
}
