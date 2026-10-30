/**
 * Legacy Flutter / PHP cart totals sum each selected variation's `optionPrice`
 * (they do not use food.price + additive delta). Only the **first** variation group
 * (main dish / sizes) may inherit `food.price` when stored deltas are 0. Side dishes,
 * salads, bread (+3), etc. keep their stored deltas only — never add base again.
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

export function variationsForMobileClient(basePrice: number, raw: unknown): unknown[] {
  if (!Array.isArray(raw) || !raw.length) return [];

  const base = Number(basePrice) || 0;

  return raw.map((group, groupIndex) => {
    if (!group || typeof group !== 'object') return group;
    const g = group as Record<string, unknown>;
    const key = listKey(g);
    if (!key) return group;

    const rawOpts = g[key] as unknown[];
    const deltas = rawOpts
      .filter((o): o is Record<string, unknown> => !!o && typeof o === 'object')
      .map(optionDelta);
    const minD = deltas.length ? Math.min(...deltas) : 0;
    const maxD = deltas.length ? Math.max(...deltas) : 0;
    const allZero = deltas.length > 0 && maxD === 0 && minD === 0;

    const looksLikeNormalizedSizes =
      base > 0 && minD === 0 && maxD > 0 && maxD < base - 0.001;

    // Only group 0: main item row or size ladder after additive normalize (0/10/20).
    const carryBaseOnGroup =
      groupIndex === 0 &&
      base > 0 &&
      (looksLikeNormalizedSizes || allZero);

    const options = rawOpts.map((opt) => {
      if (!opt || typeof opt !== 'object') return opt;
      const o = opt as Record<string, unknown>;
      const delta = optionDelta(o);
      const legacy = carryBaseOnGroup && base > 0 ? roundMoney(base + delta) : roundMoney(delta);
      const label = o.label ?? o.name ?? o.level;

      return {
        ...o,
        ...(label != null ? { label, level: o.level ?? label, name: o.name ?? label } : {}),
        optionPrice: legacy,
        price: legacy,
      };
    });

    return { ...g, [key]: options };
  });
}
