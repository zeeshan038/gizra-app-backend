/** Pizza half / whole placement — display only; does not affect pricing. */

export type PizzaPlacementCode = 'whole' | 'half_a' | 'half_b';

const PLACEMENT_ALIASES: Record<string, PizzaPlacementCode> = {
  whole: 'whole',
  full: 'whole',
  שלם: 'whole',
  half_a: 'half_a',
  halfa: 'half_a',
  first_half: 'half_a',
  right: 'half_a',
  "חצי א": 'half_a',
  "חצי א'": 'half_a',
  half_b: 'half_b',
  halfb: 'half_b',
  second_half: 'half_b',
  left: 'half_b',
  "חצי ב": 'half_b',
  "חצי ב'": 'half_b',
};

export function normalizePizzaPlacement(raw: unknown): PizzaPlacementCode {
  if (raw == null || raw === '') return 'whole';
  const key = String(raw).trim().toLowerCase().replace(/\s+/g, '_');
  const direct = PLACEMENT_ALIASES[key];
  if (direct) return direct;
  const loose = PLACEMENT_ALIASES[String(raw).trim()];
  if (loose) return loose;
  return 'whole';
}

/** Hebrew suffix for kitchen / receipt (whole omits suffix in compact lists). */
export function pizzaPlacementSuffix(
  raw: unknown,
  opts?: { includeWhole?: boolean }
): string {
  const code = normalizePizzaPlacement(raw);
  if (code === 'whole') {
    return opts?.includeWhole ? ' (שלם)' : '';
  }
  if (code === 'half_a') return " (חצי א')";
  return " (חצי ב')";
}

export function formatKitchenModifierName(baseName: string | null | undefined, placement?: unknown): string {
  const name = String(baseName ?? '').trim() || 'Item';
  const suffix = pizzaPlacementSuffix(placement, { includeWhole: true });
  if (!suffix) return name;
  if (name.includes(suffix.trim()) || name.includes('חצי א') || name.includes('חצי ב')) {
    return name;
  }
  return `${name}${suffix}`;
}

export function readPizzaPlacementFromSelection(value: unknown): PizzaPlacementCode | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const o = value as Record<string, unknown>;
  const raw = o.pizzaPlacement ?? o.pizza_placement ?? o.placement;
  if (raw == null) return undefined;
  return normalizePizzaPlacement(raw);
}

function labelFromVariationValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';
  const v = value as Record<string, unknown>;
  const raw = v.label ?? v.name ?? v.level ?? v.value;
  return raw != null ? String(raw).trim() : '';
}

/** Copy cart/placement selections with kitchen-ready labels for order_details.variation. */
export function enrichVariationSelectionsForKitchen(selected: unknown[] | null | undefined): unknown[] {
  if (!Array.isArray(selected) || !selected.length) return [];

  return selected.map((group) => {
    if (!group || typeof group !== 'object') return group;
    const g = { ...(group as Record<string, unknown>) };

    const mapValue = (value: unknown) => {
      const placement = readPizzaPlacementFromSelection(value);
      if (!placement || placement === 'whole') {
        if (typeof value === 'object' && value !== null) {
          return { ...(value as Record<string, unknown>), pizza_placement: 'whole' as const };
        }
        return value;
      }
      const baseLabel = labelFromVariationValue(value);
      const kitchenLabel = formatKitchenModifierName(baseLabel, placement);
      if (typeof value === 'string') {
        return {
          label: kitchenLabel,
          name: kitchenLabel,
          pizza_placement: placement,
          pizzaPlacement: placement,
        };
      }
      return {
        ...(value as Record<string, unknown>),
        pizza_placement: placement,
        pizzaPlacement: placement,
        kitchen_label: kitchenLabel,
        label: kitchenLabel,
        name: (value as Record<string, unknown>).name ?? kitchenLabel,
      };
    };

    if (Array.isArray(g.values)) {
      g.values = g.values.map(mapValue);
    } else if (g.value != null && !Array.isArray(g.values)) {
      const placement = readPizzaPlacementFromSelection(g);
      if (placement && placement !== 'whole') {
        const base = String(g.value).trim();
        const kitchenLabel = formatKitchenModifierName(base, placement);
        g.kitchen_label = kitchenLabel;
        g.value = kitchenLabel;
      }
    }

    return g;
  });
}

/** Flat kitchen strings from stored variation JSON (vendor/POS/receipt). */
export function variationKitchenLinesFromStored(variationRaw: string | null | undefined): string[] {
  if (!variationRaw?.trim()) return [];
  try {
    const parsed = JSON.parse(variationRaw);
    if (!Array.isArray(parsed)) return [];
    const lines: string[] = [];

    for (const block of parsed) {
      if (!block || typeof block !== 'object') continue;
      const b = block as Record<string, unknown>;
      const groupName = b.name != null ? String(b.name).trim() : '';

      if (Array.isArray(b.values)) {
        for (const v of b.values) {
          const placement =
            readPizzaPlacementFromSelection(v) ??
            (v && typeof v === 'object'
              ? normalizePizzaPlacement((v as Record<string, unknown>).pizza_placement)
              : 'whole');

          let label = '';
          if (typeof v === 'string') label = v.trim();
          else if (v && typeof v === 'object') {
            const vo = v as Record<string, unknown>;
            label = String(vo.kitchen_label ?? vo.label ?? vo.name ?? '').trim();
          }
          if (!label) continue;

          const compact =
            placement === 'whole'
              ? formatKitchenModifierName(label, 'whole')
              : label.includes('חצי')
                ? label
                : formatKitchenModifierName(label, placement);

          if (groupName) {
            lines.push(`${groupName}: ${compact}`);
          } else {
            lines.push(compact);
          }
        }
        continue;
      }

      if (b.value != null) {
        const label = String(b.kitchen_label ?? b.value).trim();
        if (label) lines.push(groupName ? `${groupName}: ${label}` : label);
      }
    }

    return lines;
  } catch {
    return [];
  }
}

export function normalizeAddOnPlacements(
  ids: number[],
  placements: unknown[] | undefined
): PizzaPlacementCode[] {
  return ids.map((_, i) => normalizePizzaPlacement(placements?.[i]));
}