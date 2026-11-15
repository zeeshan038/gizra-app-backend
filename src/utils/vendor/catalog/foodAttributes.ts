/** Small JSON blob on `food.attributes` for vendor-only menu flags. */

export type FoodAttributes = {
  addons_pizza_half_whole?: boolean;
};

export function parseFoodAttributes(raw: string | null | undefined): FoodAttributes {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const o = parsed as Record<string, unknown>;
    return {
      addons_pizza_half_whole: o.addons_pizza_half_whole === true || o.addonsPizzaHalfWhole === true,
    };
  } catch {
    return {};
  }
}

export function serializeFoodAttributes(attrs: FoodAttributes): string | null {
  const keys = Object.keys(attrs).filter(
    (k) => attrs[k as keyof FoodAttributes] !== undefined && attrs[k as keyof FoodAttributes] !== false
  );
  if (!keys.length) return null;
  return JSON.stringify({
    ...(attrs.addons_pizza_half_whole ? { addons_pizza_half_whole: true } : {}),
  });
}

export function mergeFoodAttributesPatch(
  existingRaw: string | null | undefined,
  patch: { addons_pizza_half_whole?: boolean }
): string | null {
  const current = parseFoodAttributes(existingRaw);
  const next: FoodAttributes = { ...current };
  if (patch.addons_pizza_half_whole !== undefined) {
    if (patch.addons_pizza_half_whole) {
      next.addons_pizza_half_whole = true;
    } else {
      delete next.addons_pizza_half_whole;
    }
  }
  return serializeFoodAttributes(next);
}