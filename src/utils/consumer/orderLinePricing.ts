/** Money rounding aligned with checkout / place-order. */
export function roundOrderMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export const ORDER_PRICE_TOLERANCE = 0.05;

function splitIsClean(clientUnit: number, foodUnit: number, addonPerUnit: number): boolean {
  return (
    foodUnit >= 0 &&
    Math.abs(clientUnit - foodUnit - addonPerUnit) <= ORDER_PRICE_TOLERANCE
  );
}

/**
 * Cart / buy-now: `price` may bundle food + add-ons while `add_on_ids` are also sent.
 * Strip add-ons once so tax is not computed on (27 + 4) when food+var is really 23.
 */
export function applyBundledAddonLinePriceRule(params: {
  unitFood: number;
  linePrice: number | undefined;
  addonPerUnit: number;
  hasAddonIds: boolean;
  catalogFoodPrice: number;
}): number {
  if (!params.hasAddonIds || params.addonPerUnit <= 0) {
    return params.unitFood;
  }
  if (params.linePrice == null || !Number.isFinite(params.linePrice) || params.linePrice <= 0) {
    return params.unitFood;
  }
  const clientLineSubtotal = roundOrderMoney(Number(params.linePrice));
  const foodFromSubtotal = roundOrderMoney(clientLineSubtotal - params.addonPerUnit);
  if (foodFromSubtotal < 0) {
    return params.unitFood;
  }
  if (Math.abs(foodFromSubtotal - params.unitFood) <= ORDER_PRICE_TOLERANCE) {
    return params.unitFood;
  }
  const catalogBase = roundOrderMoney(params.catalogFoodPrice);
  if (foodFromSubtotal + ORDER_PRICE_TOLERANCE < catalogBase) {
    return params.unitFood;
  }
  if (foodFromSubtotal < params.unitFood - ORDER_PRICE_TOLERANCE) {
    return foodFromSubtotal;
  }
  return foodFromSubtotal;
}

/** @deprecated Use applyBundledAddonLinePriceRule — `isBuyNow` is ignored (same rule for cart + buy-now). */
export function applyBuyNowLineSubtotalPriceRule(params: {
  unitFood: number;
  linePrice: number | undefined;
  addonPerUnit: number;
  hasAddonIds: boolean;
  isBuyNow: boolean;
  catalogFoodPrice?: number;
}): number {
  return applyBundledAddonLinePriceRule({
    unitFood: params.unitFood,
    linePrice: params.linePrice,
    addonPerUnit: params.addonPerUnit,
    hasAddonIds: params.hasAddonIds,
    catalogFoodPrice: params.catalogFoodPrice ?? params.unitFood,
  });
}

/**
 * Unit price for food + variations only (never add-ons).
 * Catalog (base + selected variation deltas) is authoritative; client line price only
 * helps unbundle legacy payloads that mix food and add-ons in one field.
 */
export function resolveUnitFoodPrice(params: {
  linePrice: number | undefined;
  serverUnitBase: number;
  addonPerUnit: number;
}): number {
  const serverUnitBase = roundOrderMoney(params.serverUnitBase);
  const addonPerUnit = roundOrderMoney(params.addonPerUnit);

  if (addonPerUnit <= 0) {
    return serverUnitBase;
  }

  if (params.linePrice == null || !Number.isFinite(params.linePrice) || params.linePrice <= 0) {
    return serverUnitBase;
  }

  const clientUnit = roundOrderMoney(params.linePrice);
  const asFoodOnly = roundOrderMoney(clientUnit - addonPerUnit);
  const bundleTotal = roundOrderMoney(serverUnitBase + addonPerUnit);

  if (Math.abs(clientUnit - bundleTotal) <= ORDER_PRICE_TOLERANCE) {
    return serverUnitBase;
  }

  if (Math.abs(clientUnit - serverUnitBase) <= ORDER_PRICE_TOLERANCE) {
    return serverUnitBase;
  }

  if (
    clientUnit >= bundleTotal - ORDER_PRICE_TOLERANCE &&
    splitIsClean(clientUnit, asFoodOnly, addonPerUnit) &&
    Math.abs(asFoodOnly - serverUnitBase) <= ORDER_PRICE_TOLERANCE
  ) {
    return serverUnitBase;
  }

  if (
    Math.abs(clientUnit - serverUnitBase) <= ORDER_PRICE_TOLERANCE &&
    splitIsClean(clientUnit, asFoodOnly, addonPerUnit)
  ) {
    return serverUnitBase;
  }

  return serverUnitBase;
}

/**
 * Flutter sometimes sends `price` = food + add-ons while `add_on_ids` are also present,
 * with `price` equal to server food+var (e.g. 27 = 23 + 4 when server line is 27).
 */
export function unbundleLinePriceWhenAddonsListedSeparately(params: {
  clientUnit: number;
  serverUnitBase: number;
  addonPerUnit: number;
  catalogFoodPrice: number;
  resolvedUnit: number;
}): number {
  const clientUnit = roundOrderMoney(params.clientUnit);
  const serverUnitBase = roundOrderMoney(params.serverUnitBase);
  const addonPerUnit = roundOrderMoney(params.addonPerUnit);
  const bundleTotal = roundOrderMoney(serverUnitBase + addonPerUnit);

  if (addonPerUnit <= 0) return params.resolvedUnit;

  const asFoodOnly = roundOrderMoney(clientUnit - addonPerUnit);
  const catalogBase = roundOrderMoney(params.catalogFoodPrice);

  if (
    Math.abs(clientUnit - serverUnitBase) <= ORDER_PRICE_TOLERANCE &&
    splitIsClean(clientUnit, asFoodOnly, addonPerUnit) &&
    asFoodOnly + ORDER_PRICE_TOLERANCE >= catalogBase &&
    asFoodOnly < serverUnitBase - ORDER_PRICE_TOLERANCE
  ) {
    return asFoodOnly;
  }

  if (
    clientUnit >= bundleTotal - ORDER_PRICE_TOLERANCE &&
    splitIsClean(clientUnit, asFoodOnly, addonPerUnit) &&
    Math.abs(asFoodOnly - serverUnitBase) <= ORDER_PRICE_TOLERANCE
  ) {
    return serverUnitBase;
  }

  return params.resolvedUnit;
}

/** Same unit-food resolution as place-order / quote (single source of truth). */
export function resolveCartLineUnitFoodPrice(params: {
  linePrice: number | undefined;
  serverUnitBase: number;
  addonPerUnit: number;
  catalogFoodPrice: number;
}): number {
  const addonPerUnit = roundOrderMoney(params.addonPerUnit);
  let unitBase = resolveUnitFoodPrice({
    linePrice: params.linePrice,
    serverUnitBase: params.serverUnitBase,
    addonPerUnit,
  });

  if (params.linePrice == null || addonPerUnit <= 0) {
    return unitBase;
  }

  unitBase = unbundleLinePriceWhenAddonsListedSeparately({
    clientUnit: Number(params.linePrice),
    serverUnitBase: params.serverUnitBase,
    addonPerUnit,
    catalogFoodPrice: params.catalogFoodPrice,
    resolvedUnit: unitBase,
  });

  return unitBase;
}
