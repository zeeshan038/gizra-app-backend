import prisma from '../../config/database';
import { consumerFoodMediaFields } from '../mediaStorage';
import { formatHomeCategory } from './categoryDiscoverHelpers';
import {
  expandAddOnsFromStored,
  type FoodAddonExpanded,
} from '../vendor/catalog/foodAddonHelpers';
import {
  inferListPriceFromRawVariations,
  loadLegacyVariationsForFoodRows,
  resolveRawVariations,
} from './legacyFoodVariations';
import { variationsForMobileClient } from './variationsForMobileClient';
import {
  getDefaultRestaurantTimeZone,
} from './restaurantAvailability';
import { resolveFoodSellingTime } from './foodSellingTime';

type FoodRow = {
  id: bigint;
  name: string | null;
  description: string | null;
  image: string | null;
  category_id: unknown;
  restaurant_id: unknown;
  price: unknown;
  discount: unknown;
  discount_type?: string;
  veg: boolean;
  status: boolean;
  variations: string | null;
  add_ons: string | null;
  avg_rating?: number;
  rating_count?: bigint | number;
  available_time_starts?: unknown;
  available_time_ends?: unknown;
};

export type FormatRestaurantMenuFoodExtras = {
  restaurant_name?: string | null;
  /** When set with timeZone, selling-time fields are included in the payload. */
  sellingAt?: Date;
  timeZone?: string;
};

export type RestaurantMenuCategory = {
  id: string;
  name: string;
  image: string;
  image_full_url: string | null;
  slug: string | null;
  products_count: number;
};

type CategoryChipSource = {
  id: bigint;
  parent_id: bigint;
  position: bigint;
};

/** Menu filter chip id (legacy PHP + flat vendor sections with parent_id=0). */
export function menuCategoryChipId(cat: CategoryChipSource): number | null {
  const selfId = Number(cat.id);
  if (!Number.isFinite(selfId) || selfId <= 0) return null;
  if (Number(cat.position) === 0) return selfId;
  const parentId = Number(cat.parent_id);
  if (Number.isFinite(parentId) && parentId > 0) return parentId;
  return selfId;
}

/** Category chip ids used on the restaurant menu (parent categories that have active items). */
export async function loadRestaurantMenuCategories(
  restaurantId: number
): Promise<RestaurantMenuCategory[]> {
  const foodCategories = await prisma.food.findMany({
    where: {
      restaurant_id: restaurantId,
      status: true,
      category_id: { not: null },
    },
    select: { category_id: true },
    distinct: ['category_id'],
  });

  const linkedCategoryIds = foodCategories
    .map((row) => (row.category_id != null ? Number(row.category_id) : NaN))
    .filter((id) => Number.isFinite(id) && id > 0);

  if (!linkedCategoryIds.length) return [];

  const linked = await prisma.categories.findMany({
    where: {
      id: { in: linkedCategoryIds.map((id) => BigInt(id)) },
      status: true,
    },
    select: {
      id: true,
      name: true,
      image: true,
      slug: true,
      parent_id: true,
      position: true,
      priority: true,
    },
  });

  const parentIds = new Set<number>();
  for (const cat of linked) {
    const chipId = menuCategoryChipId(cat);
    if (chipId != null) parentIds.add(chipId);
  }

  if (!parentIds.size) return [];

  const parents = await prisma.categories.findMany({
    where: {
      id: { in: [...parentIds].map((id) => BigInt(id)) },
      status: true,
    },
    orderBy: [{ priority: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      image: true,
      slug: true,
      parent_id: true,
      position: true,
      priority: true,
    },
  });

  const counts = await countFoodsByCategoryIds(restaurantId, [...parentIds]);

  return parents.map((row) => {
    const base = formatHomeCategory(row, { products_count: counts.get(Number(row.id)) ?? 0 });
    return {
      id: base.id,
      name: base.name,
      image: base.image,
      image_full_url: base.image_full_url,
      slug: base.slug,
      products_count: base.products_count,
    };
  });
}

async function countFoodsByCategoryIds(
  restaurantId: number,
  parentCategoryIds: number[]
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  await Promise.all(
    parentCategoryIds.map(async (parentId) => {
      const ids = await expandMenuCategoryFilterIds(parentId);
      const count = await prisma.food.count({
        where: {
          restaurant_id: restaurantId,
          status: true,
          category_id: { in: ids },
        },
      });
      map.set(parentId, count);
    })
  );
  return map;
}

/** Parent category + its subcategories (legacy ProductController category filter). */
export async function expandMenuCategoryFilterIds(categoryId: number): Promise<number[]> {
  const children = await prisma.categories.findMany({
    where: { parent_id: BigInt(categoryId), status: true },
    select: { id: true },
  });
  const ids = [categoryId, ...children.map((c) => Number(c.id))];
  return [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))];
}

export function parseOptionalCategoryId(raw: unknown): number | null {
  if (raw == null || raw === '' || raw === 'all') return null;
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

export function parseMenuFoodType(raw: unknown): 'all' | 'veg' | 'non_veg' {
  const type = String(raw ?? 'all').toLowerCase();
  if (type === 'veg') return 'veg';
  if (type === 'non_veg' || type === 'nonveg') return 'non_veg';
  return 'all';
}

export async function buildRestaurantFoodWhere(params: {
  restaurantId: number;
  categoryId?: number | null;
  name?: string;
  type?: ReturnType<typeof parseMenuFoodType>;
}): Promise<Record<string, unknown>> {
  const where: Record<string, unknown> = {
    restaurant_id: params.restaurantId,
    status: true,
  };

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

  return where;
}

export function formatRestaurantMenuFood(
  f: FoodRow,
  extras?: FormatRestaurantMenuFoodExtras,
  addonLookup?: Map<number, FoodAddonExpanded>,
  legacyVariations?: unknown[]
) {
  const raw = resolveRawVariations(
    typeof f.variations === 'string' ? f.variations : null,
    legacyVariations
  );
  let basePrice = Number(f.price);
  if (basePrice <= 0 && raw.length) {
    basePrice = inferListPriceFromRawVariations(0, raw);
  }
  const parsedVariations = raw.length ? variationsForMobileClient(basePrice, raw) : [];

  const parsedAddOns = addonLookup
    ? expandAddOnsFromStored(f.add_ons, addonLookup)
    : (() => {
        try {
          if (f.add_ons) {
            const raw = JSON.parse(f.add_ons);
            return Array.isArray(raw) ? raw : [];
          }
        } catch {
          /* ignore */
        }
        return [];
      })();

  const foodMedia = consumerFoodMediaFields(f.image);

  const selling =
    extras?.timeZone != null
      ? resolveFoodSellingTime(
          f.available_time_starts,
          f.available_time_ends,
          extras.sellingAt ?? new Date(),
          extras.timeZone
        )
      : null;

  return {
    id: f.id.toString(),
    name: f.name,
    description: f.description,
    ...foodMedia,
    category_id: f.category_id != null ? String(f.category_id) : null,
    restaurant_id: f.restaurant_id != null ? String(f.restaurant_id) : null,
    restaurant_name: extras?.restaurant_name ?? null,
    price: basePrice,
    discount: Number(f.discount),
    discount_type: f.discount_type ?? 'percent',
    avg_rating: f.avg_rating ?? 0,
    rating_count: f.rating_count != null ? Number(f.rating_count) : 0,
    veg: f.veg,
    status: f.status,
    variations: parsedVariations,
    add_ons: parsedAddOns,
    ...(selling
      ? {
          available_time_starts: selling.available_time_starts,
          available_time_ends: selling.available_time_ends,
          is_available_now: selling.is_available_now,
          availability_status: selling.availability_status,
        }
      : {}),
  };
}

export async function formatRestaurantMenuFoodsBatch(
  foods: FoodRow[],
  extras?: FormatRestaurantMenuFoodExtras,
  addonLookup?: Map<number, FoodAddonExpanded>
) {
  const legacyMap = await loadLegacyVariationsForFoodRows(foods);
  const timeZone = await getDefaultRestaurantTimeZone();
  const sellingAt = new Date();
  const withSelling: FormatRestaurantMenuFoodExtras = {
    ...extras,
    timeZone,
    sellingAt,
  };
  return foods.map((f) =>
    formatRestaurantMenuFood(f, withSelling, addonLookup, legacyMap.get(Number(f.id)))
  );
}

/** Single-item format with selling-time fields (details, extras). */
export async function formatRestaurantMenuFoodWithSellingTime(
  f: FoodRow,
  extras?: Omit<FormatRestaurantMenuFoodExtras, 'timeZone' | 'sellingAt'>,
  addonLookup?: Map<number, FoodAddonExpanded>,
  legacyVariations?: unknown[]
) {
  const timeZone = await getDefaultRestaurantTimeZone();
  return formatRestaurantMenuFood(
    f,
    { ...extras, timeZone, sellingAt: new Date() },
    addonLookup,
    legacyVariations
  );
}
