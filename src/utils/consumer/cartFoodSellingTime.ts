import prisma from '../../config/database';
import { getDefaultRestaurantTimeZone } from './restaurantAvailability';
import {
  foodSellingTimeErrorMessage,
  resolveFoodSellingTime,
  type FoodAvailabilityStatus,
} from './foodSellingTime';

export class CartFoodSellingTimeError extends Error {
  constructor(
    message: string,
    public availability_status?: FoodAvailabilityStatus
  ) {
    super(message);
    this.name = 'CartFoodSellingTimeError';
  }
}

export async function assertCartFoodSellableNow(itemId: number): Promise<void> {
  const food = await prisma.food.findFirst({
    where: { id: BigInt(itemId), status: true },
    select: {
      id: true,
      available_time_starts: true,
      available_time_ends: true,
    },
  });
  if (!food) {
    throw new CartFoodSellingTimeError('Product unavailable');
  }
  const tz = await getDefaultRestaurantTimeZone();
  const snap = resolveFoodSellingTime(
    food.available_time_starts,
    food.available_time_ends,
    new Date(),
    tz
  );
  if (!snap.is_available_now) {
    throw new CartFoodSellingTimeError(
      foodSellingTimeErrorMessage(snap),
      snap.availability_status
    );
  }
}

export async function attachSellingTimeToCartRows<
  T extends { item_id: unknown; item_type?: string | null }
>(rows: T[]): Promise<Array<T & {
  is_available_now?: boolean;
  availability_status?: FoodAvailabilityStatus;
}>> {
  const foodIds = [
    ...new Set(
      rows
        .filter((r) => String(r.item_type ?? 'Food').toLowerCase() === 'food')
        .map((r) => Number(r.item_id))
        .filter((id) => Number.isFinite(id) && id > 0)
    ),
  ];
  if (!foodIds.length) return rows;

  const foods = await prisma.food.findMany({
    where: { id: { in: foodIds.map((id) => BigInt(id)) } },
    select: {
      id: true,
      available_time_starts: true,
      available_time_ends: true,
    },
  });
  const tz = await getDefaultRestaurantTimeZone();
  const at = new Date();
  const byId = new Map(
    foods.map((f) => [
      Number(f.id),
      resolveFoodSellingTime(f.available_time_starts, f.available_time_ends, at, tz),
    ])
  );

  return rows.map((row) => {
    const itemId = Number(row.item_id);
    const snap = byId.get(itemId);
    if (!snap) return row;
    return {
      ...row,
      is_available_now: snap.is_available_now,
      availability_status: snap.availability_status,
    };
  });
}
