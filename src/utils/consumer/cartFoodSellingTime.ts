import prisma from '../../config/database';
import { getDefaultRestaurantTimeZone } from './restaurantAvailability';
import {
  foodSellingTimeErrorMessage,
  resolveFoodSellingTime,
  type FoodAvailabilityStatus,
} from './foodSellingTime';
import {
  foodStockErrorMessage,
  resolveFoodStockSnapshot,
  type FoodStockStatus,
} from './foodStock';

export class CartFoodSellingTimeError extends Error {
  constructor(
    message: string,
    public availability_status?: FoodAvailabilityStatus
  ) {
    super(message);
    this.name = 'CartFoodSellingTimeError';
  }
}

export class CartFoodStockError extends Error {
  constructor(
    message: string,
    public stock_status?: FoodStockStatus,
    public current_stock?: number | null
  ) {
    super(message);
    this.name = 'CartFoodStockError';
  }
}

async function sumFoodQuantityInCart(params: {
  userId: number;
  isGuest: boolean;
  itemId: number;
  excludeCartId?: bigint;
}): Promise<number> {
  const rows = await prisma.carts.findMany({
    where: {
      user_id: params.userId,
      is_guest: params.isGuest,
      item_id: params.itemId,
    },
    select: { id: true, quantity: true },
  });
  return rows.reduce((sum, row) => {
    if (params.excludeCartId != null && row.id === params.excludeCartId) return sum;
    return sum + (Number(row.quantity) || 0);
  }, 0);
}

export async function assertCartFoodStockAvailable(params: {
  itemId: number;
  quantity: number;
  userId: number;
  isGuest: boolean;
  excludeCartId?: bigint;
}): Promise<void> {
  const food = await prisma.food.findFirst({
    where: { id: BigInt(params.itemId), status: true },
    select: {
      id: true,
      name: true,
      stock_type: true,
      item_stock: true,
      sell_count: true,
    },
  });
  if (!food) {
    throw new CartFoodStockError('Product unavailable', 'out_of_stock', 0);
  }
  const stock = resolveFoodStockSnapshot(food);
  if (stock.stock_type === 'unlimited') return;

  const alreadyInCart = await sumFoodQuantityInCart({
    userId: params.userId,
    isGuest: params.isGuest,
    itemId: params.itemId,
    excludeCartId: params.excludeCartId,
  });
  const needed = alreadyInCart + params.quantity;
  const available = stock.current_stock ?? 0;
  if (needed > available) {
    throw new CartFoodStockError(
      foodStockErrorMessage(food, needed, available),
      available > 0 ? 'in_stock' : 'out_of_stock',
      stock.current_stock
    );
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
  is_in_stock?: boolean;
  stock_status?: FoodStockStatus;
  current_stock?: number | null;
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
      stock_type: true,
      item_stock: true,
      sell_count: true,
    },
  });
  const tz = await getDefaultRestaurantTimeZone();
  const at = new Date();
  const sellingById = new Map(
    foods.map((f) => [
      Number(f.id),
      resolveFoodSellingTime(f.available_time_starts, f.available_time_ends, at, tz),
    ])
  );
  const stockById = new Map(foods.map((f) => [Number(f.id), resolveFoodStockSnapshot(f)]));

  return rows.map((row) => {
    const itemId = Number(row.item_id);
    const snap = sellingById.get(itemId);
    const stock = stockById.get(itemId);
    if (!snap && !stock) return row;
    return {
      ...row,
      ...(snap
        ? {
            is_available_now: snap.is_available_now,
            availability_status: snap.availability_status,
          }
        : {}),
      ...(stock
        ? {
            is_in_stock: stock.is_in_stock,
            stock_status: stock.stock_status,
            current_stock: stock.current_stock,
          }
        : {}),
    };
  });
}
