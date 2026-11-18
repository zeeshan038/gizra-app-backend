/** Line identity for merge / duplicate detection (incl. pizza half/whole + combo slots). */
export function cartLineIdentityWhere(
  userId: number,
  itemId: number,
  itemType: string,
  isGuest: boolean,
  line: {
    variations?: unknown[];
    variation_options?: unknown[];
    add_on_ids?: number[];
    add_on_placements?: unknown[];
    combo_selections?: unknown[];
  }
) {
  return {
    user_id: userId,
    item_id: itemId,
    item_type: itemType,
    is_guest: isGuest,
    variations: JSON.stringify(line.variations ?? []),
    variation_options: JSON.stringify(line.variation_options ?? []),
    add_on_ids: JSON.stringify(line.add_on_ids ?? []),
    add_on_placements: JSON.stringify(line.add_on_placements ?? []),
    combo_selections: JSON.stringify(line.combo_selections ?? []),
  };
}