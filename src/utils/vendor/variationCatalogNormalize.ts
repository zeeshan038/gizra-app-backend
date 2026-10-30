/** Normalize catalog variations so checkout uses base + additive option prices. */

export type VariationOptionLike = {
  name?: string;
  label?: string;
  price?: number;
  optionPrice?: number;
  [key: string]: unknown;
};

export type VariationGroupLike = {
  name?: string;
  type?: string;
  required?: boolean;
  options?: VariationOptionLike[];
  values?: VariationOptionLike[];
  [key: string]: unknown;
};

const MONEY_EPS = 0.05;

export function roundCatalogMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function optionAmount(opt: VariationOptionLike): number {
  if (opt.optionPrice != null) {
    return Number(opt.optionPrice) || 0;
  }
  if (opt.price != null) {
    return Number(opt.price) || 0;
  }
  return 0;
}

function setOptionAmount(opt: VariationOptionLike, amount: number): VariationOptionLike {
  const value = roundCatalogMoney(Math.max(0, amount));
  const next: VariationOptionLike = { ...opt, price: value };
  if ('optionPrice' in opt) {
    next.optionPrice = value;
  }
  return next;
}

function getGroupOptions(group: VariationGroupLike): VariationOptionLike[] {
  const raw = group.options ?? group.values ?? [];
  return Array.isArray(raw) ? raw : [];
}

function setGroupOptions(
  group: VariationGroupLike,
  options: VariationOptionLike[]
): VariationGroupLike {
  if (group.options !== undefined) {
    return { ...group, options };
  }
  if (group.values !== undefined) {
    return { ...group, values: options };
  }
  return { ...group, options };
}

/**
 * Detect menu rows where option prices are full item prices (45/55/65) rather than deltas (+0/+10/+20).
 */
export function groupOptionsLookAbsolute(
  basePrice: number,
  options: VariationOptionLike[]
): boolean {
  if (!options.length) return false;

  const prices = options.map(optionAmount);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const base = Number(basePrice) || 0;

  if (minP <= 0) return false;

  const minMatchesBase = base <= 0 || Math.abs(minP - base) <= MONEY_EPS;

  if (options.length === 1) {
    return minMatchesBase && minP > 0;
  }

  if (!minMatchesBase) return false;

  if (maxP - minP >= 0.01) return true;

  return maxP - minP < 0.01 && minP > 0 && base > 0 && Math.abs(minP - base) <= MONEY_EPS;
}

export function normalizeItemVariationsToAdditive(
  basePrice: number,
  variations: unknown[] | null | undefined
): { basePrice: number; variations: VariationGroupLike[] } {
  const groups: VariationGroupLike[] = Array.isArray(variations)
    ? (variations as VariationGroupLike[])
    : [];

  if (!groups.length) {
    return { basePrice: roundCatalogMoney(Number(basePrice) || 0), variations: [] };
  }

  let base = roundCatalogMoney(Number(basePrice) || 0);
  const normalizedGroups = groups.map((group) => {
    const options = getGroupOptions(group);
    if (!options.length) return group;

    if (!groupOptionsLookAbsolute(base, options)) {
      return group;
    }

    const prices = options.map(optionAmount);
    const minP = Math.min(...prices);
    if (base <= 0) {
      base = roundCatalogMoney(minP);
    }

    const nextOptions = options.map((opt) =>
      setOptionAmount(opt, optionAmount(opt) - minP)
    );
    return setGroupOptions(group, nextOptions);
  });

  return { basePrice: base, variations: normalizedGroups };
}

export function normalizeParsedMenuItem<T extends { price?: number; variations?: unknown[] }>(
  item: T
): T {
  const { basePrice, variations } = normalizeItemVariationsToAdditive(
    Number(item.price ?? 0),
    item.variations
  );
  return { ...item, price: basePrice, variations };
}

export function normalizeParsedMenu<T extends { categories: Array<{ items?: unknown[] }> }>(
  menu: T
): T {
  return {
    ...menu,
    categories: menu.categories.map((cat) => ({
      ...cat,
      items: (cat.items ?? []).map((item) =>
        normalizeParsedMenuItem(item as { price?: number; variations?: unknown[] })
      ),
    })),
  };
}
