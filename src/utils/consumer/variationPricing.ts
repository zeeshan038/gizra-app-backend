/**
 * Variation price extras — aligned with Laravel Helpers::get_varient,
 * plus Flutter app payloads ({ type, value }).
 */

function parseProductVariations(json: string | null | undefined): Array<{
  name?: string;
  type?: string;
  values?: Array<{ label?: string; name?: string; optionPrice?: number; price?: number }>;
}> {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function optionPrice(option: { optionPrice?: number; price?: number } | undefined): number {
  if (!option) return 0;
  if (option.optionPrice != null) return Number(option.optionPrice) || 0;
  if (option.price != null) return Number(option.price) || 0;
  return 0;
}

/** Resolve variation group key from a cart / place-order line (name or type). */
function variationGroupKey(selected: Record<string, unknown>): string | null {
  const key = selected.name ?? selected.type;
  if (key == null || String(key).trim() === '') return null;
  return String(key).trim();
}

/** Collect chosen option labels for one variation group. */
export function selectedVariationLabels(selected: unknown): string[] {
  if (!selected || typeof selected !== 'object') return [];
  const s = selected as Record<string, unknown>;
  const labels: string[] = [];

  const pushLabel = (raw: unknown) => {
    if (raw == null) return;
    const text = String(raw).trim();
    if (text) labels.push(text);
  };

  const values = s.values;
  if (values && typeof values === 'object' && !Array.isArray(values)) {
    const nested = values as Record<string, unknown>;
    if (Array.isArray(nested.label)) {
      for (const item of nested.label) pushLabel(item);
    } else {
      pushLabel(nested.label);
    }
  }

  if (Array.isArray(s.values)) {
    for (const val of s.values) {
      if (typeof val === 'string') pushLabel(val);
      else if (val && typeof val === 'object') {
        const v = val as Record<string, unknown>;
        pushLabel(v.label ?? v.name);
      }
    }
  }

  if (Array.isArray(s.options)) {
    for (const val of s.options) {
      if (typeof val === 'string') pushLabel(val);
      else if (val && typeof val === 'object') {
        const v = val as Record<string, unknown>;
        pushLabel(v.label ?? v.name);
      }
    }
  }

  if (s.value != null && labels.length === 0) {
    pushLabel(s.value);
  }

  if (s.label != null && labels.length === 0) {
    pushLabel(s.label);
  }

  return labels;
}

function findVariationDef(
  defs: ReturnType<typeof parseProductVariations>,
  groupKey: string
) {
  return defs.find((d) => d.name === groupKey || d.type === groupKey);
}

/** Sum optionPrice for all selected variations on a food item. */
export function computeVariationExtra(
  productVariationsJson: string | null | undefined,
  selectedVariations: unknown[] | null | undefined
): number {
  const defs = parseProductVariations(productVariationsJson ?? null);
  if (!defs.length || !selectedVariations?.length) return 0;

  let extra = 0;
  for (const selected of selectedVariations) {
    if (!selected || typeof selected !== 'object') continue;
    const s = selected as Record<string, unknown>;
    const groupKey = variationGroupKey(s);
    if (!groupKey) continue;

    const def = findVariationDef(defs, groupKey);
    if (!def?.values?.length) continue;

    for (const label of selectedVariationLabels(selected)) {
      const match = def.values.find((v) => v.label === label || v.name === label);
      extra += optionPrice(match);
    }
  }

  return extra;
}
