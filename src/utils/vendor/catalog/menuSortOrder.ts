import prisma from '../../../config/database';

export const DEFAULT_MENU_FOOD_ORDER = [
  { position: 'asc' as const },
  { id: 'asc' as const },
];

export const DEFAULT_MENU_CATEGORY_ORDER = [
  { position: 'asc' as const },
  { id: 'asc' as const },
];

function categoryKey(categoryId: unknown): number {
  if (categoryId == null) return 0;
  const n = Number(categoryId);
  return Number.isFinite(n) ? n : 0;
}

/** Next sort slot at end of the restaurant menu (global order). */
export async function nextFoodPosition(
  restaurantId: number,
  _categoryId?: unknown
): Promise<bigint> {
  const row = await prisma.food.findFirst({
    where: { restaurant_id: restaurantId },
    select: { position: true },
    orderBy: { position: 'desc' },
  });
  const max = row?.position ?? BigInt(0);
  return max + BigInt(1);
}

export async function nextCategoryPosition(restaurantId: number): Promise<bigint> {
  const row = await prisma.categories.findFirst({
    where: { restaurant_id: restaurantId },
    select: { position: true },
    orderBy: { position: 'desc' },
  });
  const max = row?.position ?? BigInt(0);
  return max + BigInt(1);
}

export async function reorderFoodsForVendor(params: {
  restaurantId: number;
  orderedIds: number[];
  categoryId?: number;
}): Promise<{ updated: number }> {
  const { restaurantId, orderedIds, categoryId } = params;
  const uniqueIds = [...new Set(orderedIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (!uniqueIds.length) {
    throw new Error('ordered_ids is required');
  }

  const foods = await prisma.food.findMany({
    where: { id: { in: uniqueIds }, restaurant_id: restaurantId },
    select: { id: true, category_id: true },
  });
  if (foods.length !== uniqueIds.length) {
    throw new Error('One or more items are invalid for this restaurant');
  }

  const allRows = await prisma.food.findMany({
    where: { restaurant_id: restaurantId, is_draft: 0 },
    select: { id: true, category_id: true },
    orderBy: DEFAULT_MENU_FOOD_ORDER,
  });
  const allIds = allRows.map((r) => Number(r.id));

  let finalOrder: number[];

  if (categoryId != null && Number.isFinite(categoryId)) {
    const cat = Number(categoryId);
    const inCat = new Set(
      allRows.filter((f) => categoryKey(f.category_id) === cat).map((f) => Number(f.id))
    );
    const mismatch = uniqueIds.some((id) => !inCat.has(id));
    if (mismatch) {
      throw new Error('All items must belong to the selected category');
    }
    const sent = new Set(uniqueIds);
    const missingInCat = [...inCat].filter((id) => !sent.has(id));
    const catBlock = [...uniqueIds, ...missingInCat];

    finalOrder = [];
    let catInserted = false;
    for (const id of allIds) {
      if (inCat.has(id)) {
        if (!catInserted) {
          finalOrder.push(...catBlock);
          catInserted = true;
        }
      } else {
        finalOrder.push(id);
      }
    }
  } else {
    const sent = new Set(uniqueIds);
    const missing = allIds.filter((id) => !sent.has(id));
    finalOrder = [...uniqueIds, ...missing];
  }

  await prisma.$transaction(
    finalOrder.map((id, index) =>
      prisma.food.update({
        where: { id: BigInt(id) },
        data: { position: BigInt(index + 1), updated_at: new Date() },
      })
    )
  );

  return { updated: finalOrder.length };
}

export async function reorderCategoriesForVendor(params: {
  restaurantId: number;
  orderedIds: number[];
}): Promise<{ updated: number }> {
  const { restaurantId, orderedIds } = params;
  const uniqueIds = [...new Set(orderedIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (!uniqueIds.length) {
    throw new Error('ordered_ids is required');
  }

  const rows = await prisma.categories.findMany({
    where: {
      id: { in: uniqueIds.map((i) => BigInt(i)) },
      restaurant_id: restaurantId,
      status: true,
    },
    select: { id: true },
  });
  if (rows.length !== uniqueIds.length) {
    throw new Error('One or more categories are invalid');
  }

  await prisma.$transaction(
    uniqueIds.map((id, index) =>
      prisma.categories.update({
        where: { id: BigInt(id) },
        data: { position: BigInt(index + 1), updated_at: new Date() },
      })
    )
  );

  return { updated: uniqueIds.length };
}
