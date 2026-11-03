import prisma from '../../config/database';
import { expandHomeCategoryIdsForCount } from './categoryDiscoverHelpers';

/** Explicit admin assignments, or legacy inference via menu items in zone. */
export async function resolveRestaurantIdsForHomeCategory(
  categoryId: number,
  zoneIds: number[]
): Promise<number[]> {
  const links = await prisma.home_category_restaurant.findMany({
    where: { category_id: categoryId },
    select: { restaurant_id: true },
  });
  const assigned = links
    .map((l) => Number(l.restaurant_id))
    .filter((id) => Number.isFinite(id) && id > 0);
  if (assigned.length > 0) {
    return assigned;
  }

  if (!zoneIds.length) return [];

  const zoneRestaurants = await prisma.restaurants.findMany({
    where: { status: true, zone_id: { in: zoneIds } },
    select: { id: true },
  });
  const restaurantIds = zoneRestaurants.map((r) => Number(r.id)).filter((id) => id > 0);
  if (!restaurantIds.length) return [];

  const categoryIds = await expandHomeCategoryIdsForCount(BigInt(categoryId), []);
  const catSet = new Set(categoryIds);

  const foods = await prisma.food.findMany({
    where: {
      status: true,
      restaurant_id: { in: restaurantIds },
      category_id: { in: categoryIds },
    },
    select: { restaurant_id: true, category_ids: true, category_id: true },
  });

  const result = new Set<number>();
  for (const food of foods) {
    let matches = catSet.has(Number(food.category_id));
    if (!matches && food.category_ids) {
      try {
        const parsed = JSON.parse(food.category_ids) as Array<{ id?: number | string }>;
        if (Array.isArray(parsed)) {
          matches = parsed.some((entry) => catSet.has(Number(entry.id)));
        }
      } catch {
        // ignore malformed category_ids
      }
    }
    if (matches) {
      result.add(Number(food.restaurant_id));
    }
  }

  return [...result];
}
