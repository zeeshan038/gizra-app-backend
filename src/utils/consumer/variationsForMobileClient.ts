/**
 * Legacy Flutter / PHP cart totals sum each selected variation's `optionPrice`
 * (they do not use food.price + additive delta). After catalog normalization,
 * optionPrice in DB is often 0 for the default size — expand for API responses only.
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

function isRequiredGroup(g: Record<string, unknown>): boolean {
  const r = g.required;
  return r === true || r === 1 || r === '1' || String(r).toLowerCase() === 'on';
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

    const carryBaseOnGroup =
      looksLikeNormalizedSizes ||
      (allZero && (isRequiredGroup(g) || groupIndex === 0 || rawOpts.length === 1));

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
