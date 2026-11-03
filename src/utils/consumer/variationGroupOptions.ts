/** Read option rows from a stored variation group (`values` and/or legacy `options`). */

export function readVariationGroupOptionRows(group: Record<string, unknown>): unknown[] {
  const values = group.values;
  const options = group.options;
  const valuesArr = Array.isArray(values) ? values : [];
  const optionsArr = Array.isArray(options) ? options : [];
  if (valuesArr.length > 0) return valuesArr;
  if (optionsArr.length > 0) return optionsArr;
  return [];
}

/** Persist only StackFood-compatible `values` (non-empty when options exist on legacy rows). */
export function sanitizeVariationGroupsForStorage(
  variations: unknown[] | null | undefined
): Record<string, unknown>[] {
  if (!Array.isArray(variations)) return [];

  return variations
    .filter((group): group is Record<string, unknown> => !!group && typeof group === 'object')
    .map((group) => {
      const rows = readVariationGroupOptionRows(group);
      const next: Record<string, unknown> = { ...group, values: rows };
      delete next.options;
      return next;
    });
}
