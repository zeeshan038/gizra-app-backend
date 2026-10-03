import prisma from '../../config/database';
import { publicMediaUrl } from '../mediaStorage';
import { getBusinessSetting } from './businessSettings';

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
  const image = row.image || 'def.png';
  return {
    id: row.id.toString(),
    name: row.name,
    image,
    image_full_url: publicMediaUrl(image.startsWith('category/') ? image : `category/${image}`),
    slug: row.slug,
    priority: Number(row.priority),
    parent_id: row.parent_id.toString(),
    products_count: extras?.products_count ?? 0,
    order_count: extras?.order_count ?? 0,
    ...(extras?.childes?.length ? { childes: extras.childes } : {}),
  };
}

/** Admin / marketplace tiles (not vendor menu categories). */
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
  const defaultStatus = await getBusinessSetting('category_list_default_status');
  if (defaultStatus !== '0' && defaultStatus !== 'false') {
    return { priority: 'desc' };
  }
  const sortBy = (await getBusinessSetting('category_list_sort_by_general')) ?? '';
  switch (sortBy) {
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

  const catNums = categoryIds.map((id) => Number(id));
  const foods = await prisma.food.findMany({
    where: {
      status: true,
      restaurant_id: { in: restaurantIds },
      category_id: { in: catNums },
    },
    select: { order_count: true },
  });

  return {
    products_count: foods.length,
    order_count: foods.reduce((sum, f) => sum + Number(f.order_count), 0),
  };
}
