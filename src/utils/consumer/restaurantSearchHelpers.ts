import { Request } from 'express';
import prisma from '../../config/database';
import { RESTAURANT_TRANSLATION_TYPE } from '../../types/vendor/restaurantSetup';

const FOOD_TRANSLATION_TYPE = 'App\\Models\\Food';

const DEFAULT_RESTAURANT_SEARCH_LIMIT = 50;

function fieldContainsOr(
  field: 'name' | 'value' | 'tag',
  tokens: string[]
): Record<string, unknown>[] {
  return tokens.map((token) => ({
    [field]: { contains: token, mode: 'insensitive' as const },
  }));
}

/** App search bar query param (legacy PHP used `name`). */
export function parseConsumerSearchQuery(req: Request): string {
  const raw = req.query.name ?? req.query.search ?? req.query.q;
  if (raw == null || raw === 'null') return '';
  return String(raw).trim();
}

/** Split on whitespace; mirrors PHP `explode(' ', $name)` with empty parts removed. */
export function tokenizeSearchQuery(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed || trimmed === 'null') return [];
  return trimmed.split(/\s+/).filter(Boolean);
}

function baseEligibleRestaurantWhere(zoneIds: number[] | null): Record<string, unknown> {
  const where: Record<string, unknown> = { status: true };
  if (zoneIds?.length) {
    where.zone_id = { in: zoneIds };
  }
  return where;
}

async function restaurantIdsInZones(zoneIds: number[]): Promise<number[]> {
  const rows = await prisma.restaurants.findMany({
    where: { status: true, zone_id: { in: zoneIds } },
    select: { id: true },
  });
  return rows.map((r) => Number(r.id));
}

/**
 * Restaurant ids matching consumer search (PHP food_or_restaurant_search / search_restaurants parity).
 * Any token may match name, translation, cuisine, menu item, or tag. Closed restaurants are included.
 */
export async function findRestaurantIdsForConsumerSearch(
  tokens: string[],
  zoneIds: number[] | null,
  fullQuery: string
): Promise<number[]> {
  if (!tokens.length) return [];

  const idSet = new Set<number>();
  const baseWhere = baseEligibleRestaurantWhere(zoneIds);

  const nameOr: Record<string, unknown>[] = fieldContainsOr('name', tokens);
  if (fullQuery.includes(' ')) {
    nameOr.push({ name: { contains: fullQuery, mode: 'insensitive' } });
  }

  const [byName, translationRows, cuisineLinks, foods, tagLinks] = await Promise.all([
    prisma.restaurants.findMany({
      where: { ...baseWhere, OR: nameOr },
      select: { id: true },
    }),
    prisma.translations.findMany({
      where: {
        translationable_type: RESTAURANT_TRANSLATION_TYPE,
        OR: fieldContainsOr('value', tokens),
      },
      select: { translationable_id: true },
    }),
    prisma.cuisines
      .findMany({
        where: { status: true, OR: fieldContainsOr('name', tokens) },
        select: { id: true },
      })
      .then(async (cuisines) => {
        if (!cuisines.length) return [] as { restaurant_id: unknown }[];
        return prisma.cuisine_restaurant.findMany({
          where: { cuisine_id: { in: cuisines.map((c) => Number(c.id)) } },
          select: { restaurant_id: true },
        });
      }),
    (async () => {
      const foodWhere: Record<string, unknown> = {
        status: true,
        OR: fieldContainsOr('name', tokens),
      };
      if (zoneIds?.length) {
        const inZone = await restaurantIdsInZones(zoneIds);
        if (!inZone.length) return [];
        foodWhere.restaurant_id = { in: inZone };
      }
      return prisma.food.findMany({
        where: foodWhere,
        select: { restaurant_id: true },
        distinct: ['restaurant_id'],
      });
    })(),
    (async () => {
      const tags = await prisma.tags.findMany({
        where: { OR: fieldContainsOr('tag', tokens) },
        select: { id: true },
      });
      if (!tags.length) return [] as { restaurant_id: unknown }[];
      return prisma.restaurant_tag.findMany({
        where: { tag_id: { in: tags.map((t) => Number(t.id)) } },
        select: { restaurant_id: true },
      });
    })(),
  ]);

  for (const row of byName) idSet.add(Number(row.id));
  for (const row of translationRows) {
    const id = Number(row.translationable_id);
    if (Number.isFinite(id)) idSet.add(id);
  }
  for (const row of cuisineLinks) {
    const id = Number(row.restaurant_id);
    if (Number.isFinite(id)) idSet.add(id);
  }
  for (const row of foods) {
    const id = Number(row.restaurant_id);
    if (Number.isFinite(id)) idSet.add(id);
  }
  for (const row of tagLinks) {
    const id = Number(row.restaurant_id);
    if (Number.isFinite(id)) idSet.add(id);
  }

  if (!idSet.size) return [];

  const candidateIds = [...idSet].map((id) => BigInt(id));
  const eligible = await prisma.restaurants.findMany({
    where: { ...baseWhere, id: { in: candidateIds } },
    select: { id: true },
  });
  return eligible.map((r) => Number(r.id));
}

/** Build Prisma `where` for menu items in combined food + restaurant search. */
export async function buildConsumerFoodSearchWhere(
  tokens: string[],
  zoneIds: number[] | null
): Promise<Record<string, unknown>> {
  const orClause: Record<string, unknown>[] = fieldContainsOr('name', tokens);

  const translationRows = await prisma.translations.findMany({
    where: {
      translationable_type: FOOD_TRANSLATION_TYPE,
      OR: fieldContainsOr('value', tokens),
    },
    select: { translationable_id: true },
  });
  const foodIdsFromTranslations = translationRows
    .map((row) => Number(row.translationable_id))
    .filter((id) => Number.isFinite(id));
  if (foodIdsFromTranslations.length) {
    orClause.push({ id: { in: foodIdsFromTranslations.map((id) => BigInt(id)) } });
  }

  const where: Record<string, unknown> = {
    status: true,
    OR: orClause,
  };

  if (zoneIds?.length) {
    const inZone = await restaurantIdsInZones(zoneIds);
    where.restaurant_id = { in: inZone };
  }

  return where;
}

export function consumerSearchRestaurantLimit(limitRaw: number | undefined): number {
  const n = limitRaw ?? DEFAULT_RESTAURANT_SEARCH_LIMIT;
  return Math.min(Math.max(n, 1), DEFAULT_RESTAURANT_SEARCH_LIMIT);
}

export function consumerSearchRestaurantSkip(pageRaw: number | undefined, limit: number): number {
  const page = Math.max(pageRaw ?? 1, 1);
  return (page - 1) * limit;
}
