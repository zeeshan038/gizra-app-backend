import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';
import {
  consumerCategoryMediaFields,
  fitDbString,
  normalizeStoredMedia,
} from '../../mediaStorage';
import { marketplaceTopLevelCategoryFilter } from '../../consumer/categoryDiscoverHelpers';

export function storedHomeCategoryImage(incoming: string | undefined | null): string {
  const trimmed = incoming?.trim();
  if (!trimmed) return 'def.png';
  return fitDbString(normalizeStoredMedia(trimmed, 'def.png'), 191) || 'def.png';
}

export function slugifyHomeCategoryName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05FF]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

/** Home tile opens one restaurant (customer app deep link). */
export const HOME_CATEGORY_RESTAURANT_SLUG_PREFIX = 'r:';

export function homeCategoryRestaurantSlug(restaurantId: number): string {
  return `${HOME_CATEGORY_RESTAURANT_SLUG_PREFIX}${restaurantId}`;
}

export function parseHomeCategoryLink(slug: string | null | undefined): {
  type: 'category' | 'restaurant';
  restaurantID: number | null;
} {
  const s = slug?.trim() ?? '';
  if (s.startsWith(HOME_CATEGORY_RESTAURANT_SLUG_PREFIX)) {
    const id = Number(s.slice(HOME_CATEGORY_RESTAURANT_SLUG_PREFIX.length));
    if (Number.isFinite(id) && id > 0) {
      return { type: 'restaurant', restaurantID: id };
    }
  }
  return { type: 'category', restaurantID: null };
}

export type HomeCategoryLinkExtras = {
  type: 'category' | 'restaurant';
  restaurantID: string | null;
  restaurantName: string | null;
};

export function decimalCategoryId(categoryId: number): Prisma.Decimal {
  return new Prisma.Decimal(categoryId);
}

export function decimalRestaurantId(restaurantId: number): Prisma.Decimal {
  return new Prisma.Decimal(restaurantId);
}

export function isGlobalMarketplaceRestaurantId(restaurantId: unknown): boolean {
  if (restaurantId == null) return true;
  const n = Number(restaurantId);
  return Number.isFinite(n) && n === 0;
}

export function serializeAdminHomeCategory(
  row: {
    id: bigint;
    name: string;
    image: string;
    slug: string | null;
    priority: bigint;
    status: boolean;
    parent_id: bigint;
    position: bigint;
    created_at: Date | null;
    updated_at: Date | null;
  },
  extras?: {
    restaurants_count?: number;
    restaurant_ids?: number[];
    restaurant_name?: string | null;
  }
) {
  const media = consumerCategoryMediaFields(row.image || 'def.png');
  const link = parseHomeCategoryLink(row.slug);
  const restaurantID =
    link.type === 'restaurant' && link.restaurantID != null ? String(link.restaurantID) : null;
  const restaurantName =
    link.type === 'restaurant' ? extras?.restaurant_name ?? row.name : null;

  return {
    id: row.id.toString(),
    name: row.name,
    image: media.image ?? row.image,
    image_full_url: media.image_full_url,
    slug: row.slug,
    priority: Number(row.priority),
    status: row.status,
    parent_id: row.parent_id.toString(),
    position: Number(row.position),
    restaurants_count: extras?.restaurants_count ?? 0,
    restaurant_ids: extras?.restaurant_ids ?? [],
    type: link.type,
    restaurantID,
    restaurantName,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Admin CRUD — includes inactive tiles. */
export function adminHomeCategoryWhere(categoryId?: number) {
  const where: Record<string, unknown> = {
    position: BigInt(0),
    OR: [{ restaurant_id: null }, { restaurant_id: 0 }],
  };
  if (categoryId != null && Number.isFinite(categoryId) && categoryId > 0) {
    where.id = BigInt(categoryId);
  }
  return where;
}

export async function findAdminHomeCategoryById(categoryId: number) {
  if (!Number.isFinite(categoryId) || categoryId <= 0) return null;
  return prisma.categories.findFirst({
    where: adminHomeCategoryWhere(categoryId),
  });
}

/** Customer API — active home tiles only. */
export async function findMarketplaceHomeCategoryById(categoryId: number) {
  if (!Number.isFinite(categoryId) || categoryId <= 0) return null;
  const row = await prisma.categories.findFirst({
    where: {
      id: BigInt(categoryId),
      ...marketplaceTopLevelCategoryFilter(),
    },
  });
  return row;
}

export async function assertAdminHomeCategory(categoryId: number) {
  const row = await findAdminHomeCategoryById(categoryId);
  if (!row) {
    throw new Error('Home category not found');
  }
  return row;
}

export async function replaceHomeCategoryRestaurants(
  categoryId: number,
  restaurantIds: number[]
): Promise<void> {
  await assertAdminHomeCategory(categoryId);

  const uniqueIds = [...new Set(restaurantIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (uniqueIds.length) {
    const found = await prisma.restaurants.findMany({
      where: { id: { in: uniqueIds.map((id) => BigInt(id)) } },
      select: { id: true },
    });
    const foundSet = new Set(found.map((r) => Number(r.id)));
    const missing = uniqueIds.filter((id) => !foundSet.has(id));
    if (missing.length) {
      throw new Error(`Unknown restaurant id(s): ${missing.join(', ')}`);
    }
  }

  const categoryIdDecimal = decimalCategoryId(categoryId);

  await prisma.$transaction([
    prisma.home_category_restaurant.deleteMany({
      where: { category_id: categoryIdDecimal },
    }),
    ...(uniqueIds.length
      ? [
          prisma.home_category_restaurant.createMany({
            data: uniqueIds.map((restaurant_id) => ({
              category_id: categoryIdDecimal,
              restaurant_id: decimalRestaurantId(restaurant_id),
            })),
          }),
        ]
      : []),
  ]);
}

export async function loadHomeCategoryRestaurantIds(categoryId: number): Promise<number[]> {
  const links = await prisma.home_category_restaurant.findMany({
    where: { category_id: decimalCategoryId(categoryId) },
    select: { restaurant_id: true },
  });
  return links
    .map((l) => Number(l.restaurant_id))
    .filter((id) => Number.isFinite(id) && id > 0);
}
