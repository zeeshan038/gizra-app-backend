/** Burger-box style modifier groups: opt-out included ingredients vs capped opt-in upgrades. */

export type VariationSelectionMode = 'opt_out' | 'opt_in' | 'standard';

export const UNLIMITED_MODIFIER_MAX = '999';

function isMultiType(raw: unknown): boolean {
  return String(raw ?? 'single').toLowerCase() === 'multi';
}

function parseMax(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

export function readSelectionMode(group: Record<string, unknown>): VariationSelectionMode {
  const explicit = group.selectionMode;
  if (explicit === 'opt_out' || explicit === 'opt_in' || explicit === 'standard') {
    return explicit;
  }
  if (group.defaultSelectAll === true || group.defaultSelectAll === 'true') {
    return 'opt_out';
  }
  return 'standard';
}

/** Infer mode for legacy rows saved before `selectionMode` existed. */
export function inferSelectionModeFromLegacyGroup(
  group: Record<string, unknown>,
  optionCount: number
): VariationSelectionMode {
  const stored = readSelectionMode(group);
  if (stored !== 'standard') return stored;

  if (!isMultiType(group.type)) return 'standard';

  const rawList = Array.isArray(group.values)
    ? group.values
    : Array.isArray(group.options)
      ? group.options
      : [];

  const prices = rawList
    .filter((o): o is Record<string, unknown> => !!o && typeof o === 'object')
    .map((o) => {
      if (o.optionPrice != null && o.optionPrice !== '') return Number(o.optionPrice) || 0;
      if (o.price != null && o.price !== '') return Number(o.price) || 0;
      return 0;
    });

  const allZero = prices.length > 0 && prices.every((p) => p === 0);
  const maxN = parseMax(group.max);

  if (allZero && (maxN == null || maxN >= 999 || maxN >= optionCount)) {
    return 'opt_out';
  }
  if (!allZero && maxN != null && maxN < 999) {
    return 'opt_in';
  }
  return 'standard';
}

export function resolveMobileGroupLimits(params: {
  group: Record<string, unknown>;
  optionCount: number;
}): {
  selectionMode: VariationSelectionMode;
  defaultSelectAll: boolean;
  min: string;
  max: string;
  priceDisplay: 'included' | 'price';
} {
  const { group, optionCount } = params;
  const mode = inferSelectionModeFromLegacyGroup(group, optionCount);
  const isMulti = isMultiType(group.type);

  if (mode === 'opt_out') {
    return {
      selectionMode: 'opt_out',
      defaultSelectAll: true,
      min: '0',
      max: UNLIMITED_MODIFIER_MAX,
      priceDisplay: 'included',
    };
  }

  if (mode === 'opt_in') {
    const requested = parseMax(group.max) ?? 4;
    const cap = optionCount > 0 ? Math.min(requested, optionCount) : requested;
    return {
      selectionMode: 'opt_in',
      defaultSelectAll: false,
      min: group.min != null && group.min !== '' ? String(group.min) : '0',
      max: String(Math.max(1, cap)),
      priceDisplay: 'price',
    };
  }

  let max = group.max != null && group.max !== '' ? String(group.max) : isMulti ? UNLIMITED_MODIFIER_MAX : '1';
  if (isMulti && parseMax(max) == null) max = UNLIMITED_MODIFIER_MAX;

  return {
    selectionMode: 'standard',
    defaultSelectAll: false,
    min: group.min != null && group.min !== '' ? String(group.min) : '0',
    max,
    priceDisplay: 'price',
  };
}

export function decorateMobileOption(
  opt: Record<string, unknown>,
  delta: number,
  priceDisplay: 'included' | 'price'
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...opt, optionPrice: delta, price: delta };
  if (priceDisplay === 'included' && delta === 0) {
    next.priceTag = 'included';
    next.showPrice = false;
  } else if (delta === 0) {
    next.showPrice = false;
  } else {
    next.showPrice = true;
  }
  return next;
}

export const BURGER_BOX_DUMMY_VARIATIONS = [
  {
    name: 'Ingredients to Remove',
    type: 'multi',
    required: false,
    selectionMode: 'opt_out',
    defaultSelectAll: true,
    min: '0',
    max: '999',
    values: [
      { label: 'Asado', optionPrice: 0, price: 0 },
      { label: 'Onion', optionPrice: 0, price: 0 },
    ],
  },
  {
    name: 'Paid Upgrades',
    type: 'multi',
    required: false,
    selectionMode: 'opt_in',
    defaultSelectAll: false,
    min: '0',
    max: '4',
    values: [
      { label: 'Extra Cheese', optionPrice: 5, price: 5 },
      { label: 'Egg', optionPrice: 4, price: 4 },
      { label: 'Bacon', optionPrice: 6, price: 6 },
      { label: 'Avocado', optionPrice: 7, price: 7 },
      { label: 'Jalapeño', optionPrice: 3, price: 3 },
    ],
  },
] as const;
