/**
 * Checkout uses `food.price + computeVariationExtra(...)` on raw DB variations.
 */
function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}


function optionDelta(opt: Record<string, unknown>): number {
  if (opt.optionPrice != null && opt.optionPrice !== '') {
    return Number(opt.optionPrice) || 0;
  }
  if (opt.price != null && opt.price !== '') {
    return Number(opt.price) || 0;
  }
  return 0;
}

function listKey(g: Record<string, unknown>): 'values' | 'options' | null {
  if (Array.isArray(g.values)) return 'values';
  if (Array.isArray(g.options)) return 'options';
  return null;
}

function isRequiredGroup(g: Record<string, unknown>): boolean {
  return g.required === true || g.required === 'on' || g.required === 1;
}

function isMultiGroup(g: Record<string, unknown>): boolean {
  return String(g.type ?? 'single').toLowerCase() === 'multi';
}

function deltaStats(rawOpts: unknown[]): { minD: number; maxD: number; deltas: number[] } {
  const deltas = rawOpts
    .filter((o): o is Record<string, unknown> => !!o && typeof o === 'object')
    .map(optionDelta);
  const minD = deltas.length ? Math.min(...deltas) : 0;
  const maxD = deltas.length ? Math.max(...deltas) : 0;
  return { minD, maxD, deltas };
}

/**
 * @deprecated No longer embeds base price into a variation group. Kept for callers/tests
 * that detect which group would have carried base under the old Flutter-only-sum model.
 */
export function indexOfVariationGroupCarryingBase(
  basePrice: number,
  raw: unknown[]
): number {
  const base = Number(basePrice) || 0;
  if (base <= 0) return -1;

  for (let i = 0; i < raw.length; i++) {
    const group = raw[i];
    if (!group || typeof group !== 'object') continue;
    const g = group as Record<string, unknown>;
    const key = listKey(g);
    if (!key) continue;

    const rawOpts = g[key] as unknown[];
    if (!Array.isArray(rawOpts) || !rawOpts.length) continue;

    const { minD, maxD } = deltaStats(rawOpts);
    const allZero = maxD === 0 && minD === 0;
    const looksLikeNormalizedSizes =
      minD === 0 && maxD > 0 && maxD < base - 0.001;

    if (looksLikeNormalizedSizes) return i;

    if (allZero && isRequiredGroup(g) && !isMultiGroup(g)) return i;
  }

  return -1;
}

export function variationsForMobileClient(_basePrice: number, raw: unknown): unknown[] {
  if (!Array.isArray(raw) || !raw.length) return [];

  return raw.map((group) => {
    if (!group || typeof group !== 'object') return group;
    const g = group as Record<string, unknown>;
    const key = listKey(g);
    if (!key) return group;

    const rawOpts = g[key] as unknown[];

    const options = rawOpts.map((opt) => {
      if (!opt || typeof opt !== 'object') return opt;
      const o = opt as Record<string, unknown>;
      const delta = roundMoney(optionDelta(o));
      const label = o.label ?? o.name ?? o.level;

      return {
        ...o,
        ...(label != null ? { label, level: o.level ?? label, name: o.name ?? label } : {}),
        optionPrice: delta,
        price: delta,
      };
    });

    return { ...g, [key]: options };
  });
}
