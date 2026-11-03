import prisma from '../../config/database';
import { consumerCategoryMediaFields } from '../mediaStorage';
import { getBusinessSetting } from './businessSettings';

async function getPriorityListValue(name: string, type: string): Promise<string | null> {
  const row = await prisma.priority_lists.findFirst({ where: { name, type } });
  return row?.value?.trim() || null;
}

/** Legacy PHP: business_settings + priority_lists (admin Priority setup). */
export async function resolveCategoryListSortSettings(): Promise<{
  useDefaultSort: boolean;
  sortByGeneral: string;
}> {
  const defaultStatus = await getBusinessSetting('category_list_default_status');
  const useDefaultSort = defaultStatus !== '0' && defaultStatus !== 'false';
  let sortByGeneral =
    (await getPriorityListValue('category_list_sort_by_general', 'general')) ?? '';
  if (sortByGeneral === 'popular') {
    sortByGeneral = 'order_count';
  }
  return { useDefaultSort, sortByGeneral };
}

type CategoryRow = {
  id: bigint;
  name: string;
  image: string;
  slug: string | null;
  priority: bigint;
  parent_id: bigint;
};

export type HomeCategoryFormatted = {
  id: string;
  name: string;
  image: string;
  image_full_url: string | null;
  slug: string | null;
  priority: number;
  parent_id: string;
  products_count: number;
  order_count: number;
  childes?: HomeCategoryFormatted[];
};

export function formatHomeCategory(
  row: CategoryRow,
  extras?: { products_count?: number; order_count?: number; childes?: HomeCategoryFormatted[] }
): HomeCategoryFormatted {
  const media = consumerCategoryMediaFields(row.image || 'def.png');
  return {
    id: row.id.toString(),
    name: row.name,
    image: media.image ?? row.image ?? 'def.png',
    image_full_url: media.image_full_url,
    slug: row.slug,
    priority: Number(row.priority),
    parent_id: row.parent_id.toString(),
    products_count: extras?.products_count ?? 0,
    order_count: extras?.order_count ?? 0,
    ...(extras?.childes?.length ? { childes: extras.childes } : {}),
  };
}

/**
 * Home tiles — legacy PHP GET /categories: position=0, status=1.
 * Also require no restaurant_id so vendor menu sections stay off home.
 */
export function marketplaceTopLevelCategoryFilter(name?: string) {
  const where: Record<string, unknown> = {
    status: true,
    position: BigInt(0),
    OR: [{ restaurant_id: null }, { restaurant_id: 0 }],
  };
  if (name?.trim()) {
    where.name = { contains: name.trim(), mode: 'insensitive' };
  }
  return where;
}

export async function resolveCategorySortOrder(): Promise<
  { priority: 'desc' } | { created_at: 'asc' | 'desc' } | { name: 'asc' | 'desc' }
> {
  const { useDefaultSort, sortByGeneral } = await resolveCategoryListSortSettings();
  if (useDefaultSort) {
    return { priority: 'desc' };
  }
  switch (sortByGeneral) {
    case 'latest':
      return { created_at: 'desc' };
    case 'oldest':
      return { created_at: 'asc' };
    case 'a_to_z':
      return { name: 'asc' };
    case 'z_to_a':
      return { name: 'desc' };
    default:
      return { priority: 'desc' };
  }
}

/** PHP: foods in zone whose menu category id = tile or child of tile (parent_id). */
export async function expandHomeCategoryIdsForCount(
  parentId: bigint,
  knownChildIds: bigint[] = []
): Promise<number[]> {
  const ids = new Set<number>([Number(parentId), ...knownChildIds.map((id) => Number(id))]);
  const children = await prisma.categories.findMany({
    where: { parent_id: parentId, status: true },
    select: { id: true },
  });
  for (const row of children) {
    ids.add(Number(row.id));
  }
  return [...ids];
}

export async function countZoneFoodForCategories(
  categoryIds: bigint[],
  zoneIds: number[]
): Promise<{ products_count: number; order_count: number }> {
  if (!categoryIds.length || !zoneIds.length) {
    return { products_count: 0, order_count: 0 };
  }

  const restaurants = await prisma.restaurants.findMany({
    where: { status: true, zone_id: { in: zoneIds } },
    select: { id: true },
  });
  const restaurantIds = restaurants.map((r) => Number(r.id));
  if (!restaurantIds.length) {
    return { products_count: 0, order_count: 0 };
  }

  const catNums = [...new Set(categoryIds.map((id) => Number(id)).filter((id) => id > 0))];
  if (!catNums.length) {
    return { products_count: 0, order_count: 0 };
  }

  const foods = await prisma.food.findMany({
    where: {
      status: true,
      restaurant_id: { in: restaurantIds },
      category_id: { in: catNums },
    },
    select: { order_count: true, category_ids: true, category_id: true },
  });

  const catSet = new Set(catNums);
  let products_count = 0;
  let order_count = 0;

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
      products_count += 1;
      order_count += Number(food.order_count) || 0;
    }
  }

  return { products_count, order_count };
}
