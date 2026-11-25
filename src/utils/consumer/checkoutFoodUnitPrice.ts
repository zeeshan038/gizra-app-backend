import {
  parseComboSelections,
  slotSelectionGroups,
  type ComboSlotSelection,
} from './comboDefinition';
import {
  inferListPriceFromRawVariations,
  resolveRawVariations,
} from './legacyFoodVariations';
import { roundOrderMoney, ORDER_PRICE_TOLERANCE } from './orderLinePricing';
import { computeVariationExtra } from './variationPricing';
import { variationsForMobileClient } from './variationsForMobileClient';

/**
 * Flutter often sends the same picks in both `variations` and `variation_options`.
 * Using both doubles variation surcharges (e.g. +₪50 twice → wrong VAT on multi-item carts).
 */
export function mergeCartLineVariations(line: {
  variations?: unknown[];
  variation_options?: unknown[];
  combo_selections?: unknown;
}): unknown[] {
  const combo = parseComboSelections(line.combo_selections);
  if (combo.length) {
    // Flat list for callers that only need groups; prefer per-slot pricing via computeComboVariationExtra.
    const flat: unknown[] = [];
    for (const slot of combo) {
      flat.push(...slotSelectionGroups(slot));
    }
    return flat;
  }
  const vars = line.variations ?? [];
  const opts = line.variation_options ?? [];
  if (vars.length && opts.length) {
    return opts;
  }
  return opts.length ? opts : vars;
}

/** Sum variation extras across each combo slot (group names may repeat per slot). */
export function computeComboVariationExtra(
  productVariationsJson: string | null | undefined,
  selections: ComboSlotSelection[] | unknown
): number {
  const slots = Array.isArray(selections)
    ? (selections as ComboSlotSelection[])
    : parseComboSelections(selections);
  if (!slots.length) return 0;
  let extra = 0;
  for (const slot of slots) {
    extra += computeVariationExtra(productVariationsJson, slotSelectionGroups(slot));
  }
  return extra;
}

function mobileMenuUnitBase(params: {
  catalogBasePrice: number;
  productVariationsJson: string | null | undefined;
  legacyVariations?: unknown[];
  selectedVariations: unknown[] | null | undefined;
}): number {
  const raw = resolveRawVariations(params.productVariationsJson, params.legacyVariations);
  let basePrice = Number(params.catalogBasePrice) || 0;
  if (basePrice <= 0 && raw.length) {
    basePrice = inferListPriceFromRawVariations(0, raw);
  }
  const mobileVariations = raw.length ? variationsForMobileClient(basePrice, raw) : [];
  const extra = computeVariationExtra(
    JSON.stringify(mobileVariations),
    params.selectedVariations
  );
  return roundOrderMoney(basePrice + extra);
}

/** Food + selected variations per unit (base + additive option deltas stored in catalog). */
export function resolveCheckoutServerUnitBase(params: {
  catalogBasePrice: number;
  productVariationsJson: string | null | undefined;
  legacyVariations?: unknown[];
  selectedVariations: unknown[] | null | undefined;
  comboSelections?: unknown;
}): number {
  const combo = parseComboSelections(params.comboSelections);
  if (combo.length) {
    const raw = resolveRawVariations(params.productVariationsJson, params.legacyVariations);
    let basePrice = Number(params.catalogBasePrice) || 0;
    if (basePrice <= 0 && raw.length) {
      basePrice = inferListPriceFromRawVariations(0, raw);
    }
    const mobileVariations = raw.length ? variationsForMobileClient(basePrice, raw) : [];
    const extra = computeComboVariationExtra(JSON.stringify(mobileVariations), combo);
    return roundOrderMoney(basePrice + extra);
  }
  return mobileMenuUnitBase({
    ...params,
    selectedVariations: params.selectedVariations ?? [],
  });
}

/**
 * Cart `price` is sometimes line total (unit × qty) while quantity > 1.
 * Returns per-unit price to feed into line resolution.
 */
export function coerceCartLinePriceToUnit(params: {
  linePrice: number | undefined;
  quantity: number;
  serverUnitBase: number;
}): number | undefined {
  if (params.linePrice == null || !Number.isFinite(params.linePrice) || params.linePrice <= 0) {
    return undefined;
  }
  const qty = Math.max(1, Math.floor(Number(params.quantity) || 1));
  const raw = roundOrderMoney(Number(params.linePrice));
  const serverUnit = roundOrderMoney(params.serverUnitBase);

  if (Math.abs(raw - serverUnit) <= ORDER_PRICE_TOLERANCE) {
    return raw;
  }

  if (qty <= 1) {
    return raw;
  }

  const unitFromTotal = roundOrderMoney(raw / qty);
  const looksLikeLineTotal =
    Math.abs(unitFromTotal * qty - raw) <= ORDER_PRICE_TOLERANCE &&
    (Math.abs(raw - serverUnit * qty) <= ORDER_PRICE_TOLERANCE * qty ||
      Math.abs(unitFromTotal - serverUnit) <= ORDER_PRICE_TOLERANCE);

  if (looksLikeLineTotal) {
    return unitFromTotal;
  }

  return raw;
}

/** When catalog math overshoots the client line (common with absolute variation rows), trust the client unit. */
export function clampResolvedUnitToClientLine(params: {
  unitFood: number;
  clientLineUnit: number | undefined;
  addonPerUnit: number;
}): number {
  if (params.clientLineUnit == null || params.clientLineUnit <= 0) {
    return params.unitFood;
  }
  if (params.addonPerUnit > 0) {
    return params.unitFood;
  }
  const client = roundOrderMoney(params.clientLineUnit);
  const unit = roundOrderMoney(params.unitFood);
  if (unit > client + ORDER_PRICE_TOLERANCE) {
    return client;
  }
  return unit;
}
