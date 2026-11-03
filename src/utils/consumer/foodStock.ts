import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { normalizeStockType } from '../vendor/catalog/foodDetailFields';

export type FoodStockStatus = 'in_stock' | 'out_of_stock';

export class FoodStockInsufficientError extends Error {
  constructor(
    message: string,
    public readonly code = 'food_stock'
  ) {
    super(message);
    this.name = 'FoodStockInsufficientError';
  }
}

export type FoodStockRow = {
  stock_type?: unknown;
  item_stock?: unknown;
  sell_count?: unknown;
  name?: string | null;
};

export function foodAvailableQuantity(food: FoodStockRow): number | null {
  const stockType = normalizeStockType(food.stock_type);
  if (stockType !== 'limited') return null;
  const cap = Math.max(0, Number(food.item_stock) || 0);
  const sold = Math.max(0, Number(food.sell_count) || 0);
  return Math.max(0, cap - sold);
}

export function resolveFoodStockSnapshot(food: FoodStockRow): {
  stock_type: 'limited' | 'unlimited';
  current_stock: number | null;
  is_in_stock: boolean;
  stock_status: FoodStockStatus;
} {
  const stock_type = normalizeStockType(food.stock_type);
  if (stock_type === 'unlimited') {
    return {
      stock_type,
      current_stock: null,
      is_in_stock: true,
      stock_status: 'in_stock',
    };
  }
  const current_stock = foodAvailableQuantity(food);
  const is_in_stock = (current_stock ?? 0) > 0;
  return {
    stock_type,
    current_stock,
    is_in_stock,
    stock_status: is_in_stock ? 'in_stock' : 'out_of_stock',
  };
}

export function foodStockErrorMessage(
  food: FoodStockRow,
  requestedQty: number,
  available: number
): string {
  const label = food.name?.trim() || 'This item';
  if (available <= 0) {
    return `${label} is out of stock`;
  }
  if (requestedQty > available) {
    return `Only ${available} available for ${label}`;
  }
  return `${label} is out of stock`;
}

export async function incrementFoodSellCountsForOrder(
  tx: Prisma.TransactionClient,
  lines: Array<{ food_id: number | null; quantity: number | null }>
): Promise<void> {
  const byFood = new Map<number, number>();
  for (const line of lines) {
    const foodId = line.food_id != null ? Number(line.food_id) : 0;
    const qty = line.quantity != null ? Number(line.quantity) : 0;
    if (!Number.isFinite(foodId) || foodId <= 0 || qty <= 0) continue;
    byFood.set(foodId, (byFood.get(foodId) ?? 0) + qty);
  }

  for (const [foodId, qty] of byFood) {
    const updated = await tx.$executeRaw`
      UPDATE food
      SET sell_count = sell_count + ${BigInt(qty)}
      WHERE id = ${BigInt(foodId)}
        AND stock_type = 'limited'
        AND item_stock - sell_count >= ${BigInt(qty)}
    `;
    const food = await tx.food.findUnique({
      where: { id: BigInt(foodId) },
      select: { stock_type: true, name: true, item_stock: true, sell_count: true },
    });
    if (!food) continue;
    if (normalizeStockType(food.stock_type) !== 'limited') continue;
    if (Number(updated) < 1) {
      const available = foodAvailableQuantity(food) ?? 0;
      throw new FoodStockInsufficientError(
        foodStockErrorMessage(food, qty, available)
      );
    }
  }
}

export async function restoreFoodSellCountForOrder(
  orderId: number,
  tx: Prisma.TransactionClient = prisma
): Promise<void> {
  const details = await tx.order_details.findMany({
    where: { order_id: orderId },
    select: { food_id: true, quantity: true },
  });
  const byFood = new Map<number, number>();
  for (const row of details) {
    const foodId = row.food_id != null ? Number(row.food_id) : 0;
    const qty = row.quantity != null ? Number(row.quantity) : 0;
    if (!Number.isFinite(foodId) || foodId <= 0 || qty <= 0) continue;
    byFood.set(foodId, (byFood.get(foodId) ?? 0) + qty);
  }
  for (const [foodId, qty] of byFood) {
    await tx.food.updateMany({
      where: {
        id: BigInt(foodId),
        stock_type: 'limited',
        sell_count: { gte: BigInt(qty) },
      },
      data: { sell_count: { decrement: BigInt(qty) } },
    });
  }
}
