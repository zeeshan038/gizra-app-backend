import prisma from '../../config/database';

/** Legacy Laravel: `variations` + `variation_options` when `food.variations` JSON is empty. */
export async function loadLegacyVariationsByFoodIds(
  foodIds: number[]
): Promise<Map<number, unknown[]>> {
  const map = new Map<number, unknown[]>();
  const ids = [...new Set(foodIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (!ids.length) return map;

  const [groups, options] = await Promise.all([
    prisma.variations.findMany({
      where: { food_id: { in: ids } },
      orderBy: { id: 'asc' },
    }),
    prisma.variation_options.findMany({
      where: { food_id: { in: ids } },
      orderBy: { id: 'asc' },
    }),
  ]);

  if (!groups.length) return map;

  const optsByVariationId = new Map<number, typeof options>();
  for (const opt of options) {
    const variationId = Number(opt.variation_id);
    const list = optsByVariationId.get(variationId) ?? [];
    list.push(opt);
    optsByVariationId.set(variationId, list);
  }

  const groupsByFoodId = new Map<number, typeof groups>();
  for (const group of groups) {
    const foodId = Number(group.food_id);
    const list = groupsByFoodId.get(foodId) ?? [];
    list.push(group);
    groupsByFoodId.set(foodId, list);
  }

  for (const [foodId, foodGroups] of groupsByFoodId) {
    const payload = foodGroups.map((variation) => ({
      variation_id: Number(variation.id),
      name: variation.name,
      type: variation.type,
      min: String(variation.min),
      max: String(variation.max),
      required: variation.is_required ? 'on' : 'off',
      values: (optsByVariationId.get(Number(variation.id)) ?? []).map((opt) => ({
        label: opt.option_name,
        optionPrice: opt.option_price,
        option_id: Number(opt.id),
      })),
    }));

    if (payload.some((g) => g.values.length > 0)) {
      map.set(foodId, payload);
    }
  }

  return map;
}

export function parseStoredVariationsJson(stored: string | null | undefined): unknown[] {
  if (!stored?.trim()) return [];
  try {
    const raw = JSON.parse(stored);
    return Array.isArray(raw) && raw.length ? raw : [];
  } catch {
    return [];
  }
}

export function resolveRawVariations(
  stored: string | null | undefined,
  legacyFromDb?: unknown[]
): unknown[] {
  const fromJson = parseStoredVariationsJson(stored);
  if (fromJson.length) return fromJson;
  if (Array.isArray(legacyFromDb) && legacyFromDb.length) return legacyFromDb;
  return [];
}

function optionAmount(opt: Record<string, unknown>): number {
  if (opt.optionPrice != null && opt.optionPrice !== '') {
    return Number(opt.optionPrice) || 0;
  }
  if (opt.price != null && opt.price !== '') {
    return Number(opt.price) || 0;
  }
  return 0;
}

/** Listing card price when `food.price` is 0 but options hold the real amount (PHP listing manager). */
export function inferListPriceFromRawVariations(basePrice: number, raw: unknown[]): number {
  if (basePrice > 0) return basePrice;
  if (!raw.length) return 0;

  const firstGroup = raw[0];
  if (firstGroup && typeof firstGroup === 'object') {
    const g = firstGroup as Record<string, unknown>;
    const opts = (g.values ?? g.options) as unknown[] | undefined;
    if (Array.isArray(opts) && opts.length) {
      const first = opts[0];
      if (first && typeof first === 'object') {
        const amount = optionAmount(first as Record<string, unknown>);
        if (amount > 0) return amount;
      }
    }
  }

  let min = Infinity;
  for (const group of raw) {
    if (!group || typeof group !== 'object') continue;
    const g = group as Record<string, unknown>;
    const opts = (g.values ?? g.options) as unknown[] | undefined;
    if (!Array.isArray(opts)) continue;
    for (const opt of opts) {
      if (!opt || typeof opt !== 'object') continue;
      const amount = optionAmount(opt as Record<string, unknown>);
      if (amount > 0) min = Math.min(min, amount);
    }
  }
  return Number.isFinite(min) ? min : 0;
}

export async function loadLegacyVariationsForFoodRows(
  rows: Array<{ id: unknown; variations?: string | null }>
): Promise<Map<number, unknown[]>> {
  const needsLegacy = rows.filter((row) => !parseStoredVariationsJson(row.variations ?? null));
  const ids = needsLegacy.map((row) => Number(row.id)).filter((id) => id > 0);
  return loadLegacyVariationsByFoodIds(ids);
}
