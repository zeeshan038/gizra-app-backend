import prisma from '../../config/database';

export class CartRestaurantMismatchError extends Error {
  constructor(message = 'Your cart already contains items from another restaurant.') {
    super(message);
    this.name = 'CartRestaurantMismatchError';
  }
}

export class CartItemRestaurantMismatchError extends Error {
  constructor(message = 'This item does not belong to the selected restaurant.') {
    super(message);
    this.name = 'CartItemRestaurantMismatchError';
  }
}

async function foodRestaurantId(itemId: number): Promise<number | null> {
  const food = await prisma.food.findFirst({
    where: { id: BigInt(itemId), status: true },
    select: { restaurant_id: true },
  });
  if (!food) return null;
  return Number(food.restaurant_id);
}

/** Enforce one restaurant per cart when adding; validate item belongs to `restaurantId`. */
export async function assertSingleRestaurantCart(params: {
  userId: number;
  isGuest: boolean;
  restaurantId: number;
  newItemId: number;
}): Promise<void> {
  const itemRestaurant = await foodRestaurantId(params.newItemId);
  if (itemRestaurant == null) {
    throw new CartItemRestaurantMismatchError('Product unavailable');
  }
  if (itemRestaurant !== params.restaurantId) {
    throw new CartItemRestaurantMismatchError();
  }

  const existing = await prisma.carts.findMany({
    where: { user_id: params.userId, is_guest: params.isGuest },
    select: { item_id: true },
  });
  if (!existing.length) return;

  const itemIds = [...new Set(existing.map((r) => Number(r.item_id)).filter((id) => id > 0))];
  const foods = await prisma.food.findMany({
    where: { id: { in: itemIds.map((id) => BigInt(id)) } },
    select: { restaurant_id: true },
  });
  for (const f of foods) {
    if (Number(f.restaurant_id) !== params.restaurantId) {
      throw new CartRestaurantMismatchError();
    }
  }
}

/** Re-order replace: every line must belong to the same `restaurantId`. */
export async function assertItemsBelongToRestaurant(
  itemIds: number[],
  restaurantId: number
): Promise<void> {
  const unique = [...new Set(itemIds.filter((id) => id > 0))];
  if (!unique.length) return;
  const foods = await prisma.food.findMany({
    where: { id: { in: unique.map((id) => BigInt(id)) }, status: true },
    select: { id: true, restaurant_id: true },
  });
  if (foods.length !== unique.length) {
    throw new CartItemRestaurantMismatchError('Product unavailable');
  }
  for (const f of foods) {
    if (Number(f.restaurant_id) !== restaurantId) {
      throw new CartItemRestaurantMismatchError();
    }
  }
}