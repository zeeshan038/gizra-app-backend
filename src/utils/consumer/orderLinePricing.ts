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
  const catalogMin = roundOrderMoney(params.catalogFoodPrice) - ORDER_PRICE_TOLERANCE;

  if (addonPerUnit <= 0) return params.resolvedUnit;

  if (
    Math.abs(params.resolvedUnit - serverUnitBase) > ORDER_PRICE_TOLERANCE ||
    Math.abs(clientUnit - serverUnitBase) > ORDER_PRICE_TOLERANCE ||
    clientUnit >= bundleTotal - ORDER_PRICE_TOLERANCE
  ) {
    return params.resolvedUnit;
  }

  const unbundled = roundOrderMoney(clientUnit - addonPerUnit);
  if (
    unbundled < serverUnitBase - ORDER_PRICE_TOLERANCE &&
    unbundled >= catalogMin &&
    Math.abs(clientUnit - (unbundled + addonPerUnit)) <= ORDER_PRICE_TOLERANCE
  ) {
    return Math.max(unbundled, roundOrderMoney(params.catalogFoodPrice));
  }

  return params.resolvedUnit;
}
