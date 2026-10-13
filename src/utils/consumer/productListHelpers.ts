import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import {
  expandMenuCategoryFilterIds,
  formatRestaurantMenuFood,
  parseMenuFoodType,
} from './restaurantMenuHelpers';

export const FOOD_LIST_SELECT = {
  id: true,
  name: true,
  description: true,
  image: true,
  category_id: true,
  restaurant_id: true,
  price: true,
  discount: true,
  discount_type: true,
  veg: true,
  status: true,
  variations: true,
  add_ons: true,
  avg_rating: true,
  rating_count: true,
  order_count: true,
  recommended: true,
  created_at: true,
} as const;

export type FoodListRow = Prisma.foodGetPayload<{ select: typeof FOOD_LIST_SELECT }>;

export async function restaurantIdsInZones(zoneIds: number[]): Promise<number[]> {
  if (!zoneIds.length) return [];
  const rows = await prisma.restaurants.findMany({
    where: { status: true, zone_id: { in: zoneIds } },
    select: { id: true },
  });
  return rows.map((r) => Number(r.id));
}

export async function buildZoneFoodWhere(params: {
  zoneIds?: number[];
  restaurantId?: number | null;
  categoryId?: number | null;
  name?: string;
  type?: ReturnType<typeof parseMenuFoodType>;
  minPrice?: number;
  maxPrice?: number;
  recommendedOnly?: boolean;
  minRating?: number;
}): Promise<Prisma.foodWhereInput> {
  const where: Prisma.foodWhereInput = { status: true };

  if (params.restaurantId != null) {
    where.restaurant_id = params.restaurantId;
  } else if (params.zoneIds?.length) {
    const ids = await restaurantIdsInZones(params.zoneIds);
    where.restaurant_id = { in: ids.length ? ids : [-1] };
  }

  if (params.categoryId != null) {
    const categoryIds = await expandMenuCategoryFilterIds(params.categoryId);
    where.category_id = { in: categoryIds };
  }

  const search = params.name?.trim();
  if (search) {
    where.name = { contains: search, mode: 'insensitive' };
  }

  if (params.type === 'veg') where.veg = true;
  else if (params.type === 'non_veg') where.veg = false;

  if (params.minPrice != null && params.maxPrice != null) {
    where.price = { gte: params.minPrice, lte: params.maxPrice };
  }

  if (params.recommendedOnly) where.recommended = true;
  if (params.minRating != null) where.avg_rating = { gte: params.minRating };

  return where;
}

export async function paginateFoods(params: {
  where: Prisma.foodWhereInput;
  orderBy: Prisma.foodOrderByWithRelationInput | Prisma.foodOrderByWithRelationInput[];
  limit: number;
  page: number;
}) {
  const skip = (Math.max(1, params.page) - 1) * params.limit;
  const [total_size, rows] = await Promise.all([
    prisma.food.count({ where: params.where }),
    prisma.food.findMany({
      where: params.where,
      select: FOOD_LIST_SELECT,
      orderBy: params.orderBy,
      skip,
      take: params.limit,
    }),
  ]);

  const restaurantIds = [
    ...new Set(
      rows
        .map((r) => (r.restaurant_id != null ? Number(r.restaurant_id) : NaN))
        .filter((id) => Number.isFinite(id))
    ),
  ];
  const restaurants = restaurantIds.length
    ? await prisma.restaurants.findMany({
        where: { id: { in: restaurantIds.map((id) => BigInt(id)) } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(restaurants.map((r) => [Number(r.id), r.name]));

  return {
    total_size,
    limit: params.limit,
    offset: params.page,
    products: rows.map((row) =>
      formatRestaurantMenuFood(row, {
        restaurant_name: nameById.get(Number(row.restaurant_id)) ?? null,
      })
    ),
  };
}

export function parseListPaging(query: Record<string, unknown>, fallbackLimit = 10) {
  const limit = Math.min(Math.max(Number(query.limit) || fallbackLimit, 1), 50);
  const page = Math.max(Number(query.offset ?? query.page) || 1, 1);
  return { limit, page };
}
