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
 * Buy-now checkout sends `price` as the line subtotal (food + variations + add-ons) while
 * also listing `add_on_ids`. Strip add-ons once so tax is not computed on 27 + 4.
 */
export function applyBuyNowLineSubtotalPriceRule(params: {
  unitFood: number;
  linePrice: number | undefined;
  addonPerUnit: number;
  hasAddonIds: boolean;
  isBuyNow: boolean;
}): number {
  if (!params.isBuyNow || !params.hasAddonIds || params.addonPerUnit <= 0) {
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
  return foodFromSubtotal;
}

/**
 * Unit price for food + variations only (never add-ons).
 * Cart contract: `price` excludes add-ons; legacy rows may bundle food+addons in one number.
 */
export function resolveUnitFoodPrice(params: {
  linePrice: number | undefined;
  serverUnitBase: number;
  addonPerUnit: number;
}): number {
  const serverUnitBase = roundOrderMoney(params.serverUnitBase);
  const addonPerUnit = roundOrderMoney(params.addonPerUnit);

  if (addonPerUnit <= 0) {
    if (params.linePrice == null || !Number.isFinite(params.linePrice) || params.linePrice <= 0) {
      return serverUnitBase;
    }
    return roundOrderMoney(params.linePrice);
  }

  if (params.linePrice == null || !Number.isFinite(params.linePrice) || params.linePrice <= 0) {
    return serverUnitBase;
  }

  const clientUnit = roundOrderMoney(params.linePrice);
  const asFoodOnly = roundOrderMoney(clientUnit - addonPerUnit);
  const bundleTotal = roundOrderMoney(serverUnitBase + addonPerUnit);

  // Legacy bundle matches catalog food + add-ons (e.g. 27 = 23 + 4).
  if (Math.abs(clientUnit - bundleTotal) <= ORDER_PRICE_TOLERANCE) {
    return serverUnitBase;
  }

  // Food-only unit from app (e.g. 23 with add-ons billed separately).
  if (
    Math.abs(clientUnit + addonPerUnit - serverUnitBase) <= ORDER_PRICE_TOLERANCE
  ) {
    return clientUnit;
  }

  if (
    clientUnit <= serverUnitBase + ORDER_PRICE_TOLERANCE &&
    clientUnit < bundleTotal - ORDER_PRICE_TOLERANCE
  ) {
    return clientUnit;
  }

  // Legacy: `price` = food + add-ons while add-ons are also summed separately.
  if (
    clientUnit >= bundleTotal - ORDER_PRICE_TOLERANCE &&
    splitIsClean(clientUnit, asFoodOnly, addonPerUnit)
  ) {
    return asFoodOnly;
  }

  // `price` equals catalog food+var while add-ons are listed separately (e.g. 27 + add-ons 4).
  if (
    Math.abs(clientUnit - serverUnitBase) <= ORDER_PRICE_TOLERANCE &&
    splitIsClean(clientUnit, asFoodOnly, addonPerUnit)
  ) {
    return asFoodOnly;
  }

  return clientUnit;
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

  if (
    Math.abs(params.resolvedUnit - serverUnitBase) <= ORDER_PRICE_TOLERANCE &&
    Math.abs(clientUnit - serverUnitBase) <= ORDER_PRICE_TOLERANCE &&
    splitIsClean(clientUnit, asFoodOnly, addonPerUnit)
  ) {
    return asFoodOnly;
  }

  if (
    clientUnit >= bundleTotal - ORDER_PRICE_TOLERANCE &&
    splitIsClean(clientUnit, asFoodOnly, addonPerUnit)
  ) {
    return asFoodOnly;
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

  const clientUnit = roundOrderMoney(Number(params.linePrice));
  const foodOnlyFromClient = roundOrderMoney(clientUnit - addonPerUnit);
  const serverFoodOnly = roundOrderMoney(params.serverUnitBase - addonPerUnit);
  if (
    Math.abs(clientUnit - params.serverUnitBase) <= ORDER_PRICE_TOLERANCE &&
    clientUnit <
      roundOrderMoney(params.serverUnitBase + addonPerUnit) - ORDER_PRICE_TOLERANCE &&
    Math.abs(foodOnlyFromClient - serverFoodOnly) <= ORDER_PRICE_TOLERANCE &&
    foodOnlyFromClient < params.serverUnitBase - ORDER_PRICE_TOLERANCE &&
    clientUnit > serverFoodOnly + addonPerUnit - ORDER_PRICE_TOLERANCE
  ) {
    unitBase = foodOnlyFromClient;
  }

  return unitBase;
}
