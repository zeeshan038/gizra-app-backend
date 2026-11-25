/**
 * Multi-slot combo meals (e.g. 4-Burger Combo).
 * Catalog: food.combo_definition JSON.
 * Cart: carts.combo_selections JSON (one configured slot per entry).
 */

export type ComboDefinition = {
  enabled: boolean;
  /** Number of configurable slots (e.g. 4). */
  slot_count: number;
  /** Base label → "Burger #1". Default "Item". */
  slot_label: string;
};

export type ComboSlotSelection = {
  slot_index: number;
  slot_label?: string;
  /** Same shape as cart variation_options / variations groups. */
  variations?: unknown[];
  variation_options?: unknown[];
};

export function parseComboDefinition(raw: unknown): ComboDefinition | null {
  if (raw == null) return null;
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const o = parsed as Record<string, unknown>;
  const enabled = o.enabled === true || o.enabled === 1 || o.enabled === '1';
  const slotCount = Math.floor(Number(o.slot_count ?? o.slotCount ?? 0));
  if (!enabled || !Number.isFinite(slotCount) || slotCount < 2) return null;
  const slotLabelRaw = o.slot_label ?? o.slotLabel ?? 'Item';
  const slot_label = String(slotLabelRaw || 'Item').trim() || 'Item';
  return {
    enabled: true,
    slot_count: Math.min(20, Math.max(2, slotCount)),
    slot_label,
  };
}

export function serializeComboDefinition(
  def: ComboDefinition | null | undefined
): string | null {
  if (!def?.enabled) return null;
  const slot_count = Math.min(20, Math.max(2, Math.floor(Number(def.slot_count) || 0)));
  if (slot_count < 2) return null;
  return JSON.stringify({
    enabled: true,
    slot_count,
    slot_label: String(def.slot_label || 'Item').trim() || 'Item',
  });
}

export function buildComboSlotLabels(def: ComboDefinition): string[] {
  const base = def.slot_label || 'Item';
  return Array.from({ length: def.slot_count }, (_, i) => `${base} #${i + 1}`);
}

/** Menu/API shape for Flutter step UI. */
export function comboDefinitionForClient(raw: unknown): Record<string, unknown> | null {
  const def = parseComboDefinition(raw);
  if (!def) return null;
  const slot_labels = buildComboSlotLabels(def);
  return {
    enabled: true,
    slot_count: def.slot_count,
    slot_label: def.slot_label,
    slot_labels,
    steps: slot_labels.map((label, index) => ({
      slot_index: index + 1,
      label,
      required: true,
    })),
  };
}

export function parseComboSelections(raw: unknown): ComboSlotSelection[] {
  if (raw == null) return [];
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const slots: ComboSlotSelection[] = [];
  parsed.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const o = entry as Record<string, unknown>;
    const slot_index = Math.floor(Number(o.slot_index ?? o.slotIndex ?? index + 1));
    if (!Number.isFinite(slot_index) || slot_index < 1) return;
    const variations = Array.isArray(o.variations) ? o.variations : [];
    const variation_options = Array.isArray(o.variation_options)
      ? o.variation_options
      : [];
    const slot: ComboSlotSelection = {
      slot_index,
      variations,
      variation_options,
    };
    if (o.slot_label != null || o.slotLabel != null) {
      slot.slot_label = String(o.slot_label ?? o.slotLabel);
    }
    slots.push(slot);
  });
  return slots.sort((a, b) => a.slot_index - b.slot_index);
}

export function slotSelectionGroups(slot: ComboSlotSelection): unknown[] {
  const vars = slot.variations ?? [];
  const opts = slot.variation_options ?? [];
  if (vars.length && opts.length) return opts;
  return opts.length ? opts : vars;
}

/**
 * Flatten combo slots into kitchen-friendly variation rows.
 * Prefixes group names with slot label so existing POS formatters work.
 */
export function flattenComboSelectionsForKitchen(
  selections: ComboSlotSelection[],
  def?: ComboDefinition | null
): unknown[] {
  const labels = def ? buildComboSlotLabels(def) : [];
  const out: unknown[] = [];
  for (const slot of selections) {
    const label =
      slot.slot_label?.trim() ||
      labels[slot.slot_index - 1] ||
      `Item #${slot.slot_index}`;
    for (const group of slotSelectionGroups(slot)) {
      if (!group || typeof group !== 'object') continue;
      const g = group as Record<string, unknown>;
      const groupName = String(g.name ?? g.type ?? 'Option').trim() || 'Option';
      out.push({
        ...g,
        name: `${label} · ${groupName}`,
        slot_index: slot.slot_index,
        slot_label: label,
      });
    }
  }
  return out;
}

export type ComboValidationResult =
  | { ok: true; selections: ComboSlotSelection[] }
  | { ok: false; msg: string; code: string };

function isGroupRequired(group: Record<string, unknown>): boolean {
  return group.required === true || group.required === 'on' || group.required === 1;
}

function groupMin(group: Record<string, unknown>): number {
  if (isGroupRequired(group) && String(group.type).toLowerCase() === 'single') return 1;
  const min = Number(group.min);
  if (Number.isFinite(min) && min > 0) return min;
  if (isGroupRequired(group)) return 1;
  return 0;
}

function selectedCountForGroup(selected: unknown): number {
  if (!selected || typeof selected !== 'object') return 0;
  const s = selected as Record<string, unknown>;
  const values = s.values;
  if (values && typeof values === 'object' && !Array.isArray(values)) {
    const nested = values as Record<string, unknown>;
    if (Array.isArray(nested.label)) return nested.label.filter(Boolean).length;
    if (nested.label != null && String(nested.label).trim()) return 1;
  }
  if (Array.isArray(values)) return values.filter(Boolean).length;
  if (Array.isArray(s.options)) return s.options.filter(Boolean).length;
  if (s.value != null && String(s.value).trim()) return 1;
  if (s.label != null && String(s.label).trim()) return 1;
  return 0;
}

function findSelectedGroup(
  selectedGroups: unknown[],
  groupName: string
): unknown | undefined {
  const key = groupName.trim().toLowerCase();
  return selectedGroups.find((g) => {
    if (!g || typeof g !== 'object') return false;
    const o = g as Record<string, unknown>;
    const name = String(o.name ?? o.type ?? '')
      .trim()
      .toLowerCase();
    return name === key;
  });
}

/**
 * Ensure every required slot is present and each slot satisfies required variation groups.
 * Template groups come from food.variations (same modifiers repeated per slot).
 */
export function validateComboSelections(params: {
  definition: ComboDefinition;
  selections: unknown;
  productVariationsJson?: string | null;
}): ComboValidationResult {
  const { definition } = params;
  const selections = parseComboSelections(params.selections);
  const expectedLabels = buildComboSlotLabels(definition);

  if (selections.length < definition.slot_count) {
    return {
      ok: false,
      msg: `Please complete all ${definition.slot_count} ${definition.slot_label.toLowerCase()} selections`,
      code: 'combo_incomplete',
    };
  }

  const byIndex = new Map(selections.map((s) => [s.slot_index, s]));
  for (let i = 1; i <= definition.slot_count; i++) {
    if (!byIndex.has(i)) {
      return {
        ok: false,
        msg: `Missing configuration for ${expectedLabels[i - 1]}`,
        code: 'combo_incomplete',
      };
    }
  }

  let templateGroups: Record<string, unknown>[] = [];
  if (params.productVariationsJson) {
    try {
      const parsed = JSON.parse(params.productVariationsJson);
      if (Array.isArray(parsed)) {
        templateGroups = parsed.filter(
          (g): g is Record<string, unknown> => g != null && typeof g === 'object'
        );
      }
    } catch {
      templateGroups = [];
    }
  }

  for (let i = 1; i <= definition.slot_count; i++) {
    const slot = byIndex.get(i)!;
    const selectedGroups = slotSelectionGroups(slot);
    const slotLabel = slot.slot_label?.trim() || expectedLabels[i - 1];

    for (const group of templateGroups) {
      const name = String(group.name ?? '').trim();
      if (!name) continue;
      const min = groupMin(group);
      if (min <= 0) continue;
      const selected = findSelectedGroup(selectedGroups, name);
      const count = selectedCountForGroup(selected);
      if (count < min) {
        return {
          ok: false,
          msg: `${slotLabel}: please complete "${name}"`,
          code: 'combo_slot_incomplete',
        };
      }
    }
  }

  const normalized: ComboSlotSelection[] = [];
  for (let i = 1; i <= definition.slot_count; i++) {
    const slot = byIndex.get(i)!;
    normalized.push({
      ...slot,
      slot_index: i,
      slot_label: slot.slot_label?.trim() || expectedLabels[i - 1],
    });
  }

  return { ok: true, selections: normalized };
}
