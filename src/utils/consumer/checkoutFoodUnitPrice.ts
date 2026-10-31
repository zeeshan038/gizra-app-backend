import { normalizeItemVariationsToAdditive } from '../vendor/variationCatalogNormalize';
import {
  inferListPriceFromRawVariations,
  resolveRawVariations,
} from './legacyFoodVariations';
import { roundOrderMoney, ORDER_PRICE_TOLERANCE } from './orderLinePricing';
import { computeVariationExtra } from './variationPricing';
import { variationsForMobileClient } from './variationsForMobileClient';

function parseProductVariationsJson(json: string | null | undefined): unknown[] {
  if (!json?.trim()) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Flutter often sends the same picks in both `variations` and `variation_options`.
 * Using both doubles variation surcharges (e.g. +₪50 twice → wrong VAT on multi-item carts).
 */
export function mergeCartLineVariations(line: {
  variations?: unknown[];
  variation_options?: unknown[];
}): unknown[] {
  const vars = line.variations ?? [];
  const opts = line.variation_options ?? [];
  if (vars.length && opts.length) {
    return opts;
  }
  return opts.length ? opts : vars;
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

function catalogNormalizedUnitBase(params: {
  catalogBasePrice: number;
  productVariationsJson: string | null | undefined;
  legacyVariations?: unknown[];
  selectedVariations: unknown[] | null | undefined;
}): number {
  const raw = resolveRawVariations(params.productVariationsJson, params.legacyVariations);
  const parsed = raw.length ? raw : parseProductVariationsJson(params.productVariationsJson);
  const { basePrice, variations } = normalizeItemVariationsToAdditive(
    params.catalogBasePrice,
    parsed
  );
  const extra = computeVariationExtra(JSON.stringify(variations), params.selectedVariations);
  return roundOrderMoney(basePrice + extra);
}

/** Food + selected variations per unit (aligned with menu + absolute tier catalogs). */
export function resolveCheckoutServerUnitBase(params: {
  catalogBasePrice: number;
  productVariationsJson: string | null | undefined;
  legacyVariations?: unknown[];
  selectedVariations: unknown[] | null | undefined;
}): number {
  const selected = params.selectedVariations ?? [];
  const mobileTotal = mobileMenuUnitBase({ ...params, selectedVariations: selected });
  const catalogTotal = catalogNormalizedUnitBase({ ...params, selectedVariations: selected });

  if (catalogTotal > mobileTotal + ORDER_PRICE_TOLERANCE) {
    return mobileTotal;
  }
  if (mobileTotal > catalogTotal + ORDER_PRICE_TOLERANCE) {
    return catalogTotal;
  }
  return catalogTotal;
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
