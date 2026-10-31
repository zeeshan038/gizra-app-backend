/**
 * Same checks as test-order-line-pricing.ts — runs on server after `npm run build`.
 */
const {
  mergeCartLineVariations,
  resolveCheckoutServerUnitBase,
} = require('../dist/utils/consumer/checkoutFoodUnitPrice');
const { computeVariationExtra } = require('../dist/utils/consumer/variationPricing');
const {
  applyBundledAddonLinePriceRule,
  resolveCartLineUnitFoodPrice,
  roundOrderMoney,
} = require('../dist/utils/consumer/orderLinePricing');

const TAX_PERCENT = 5;
let failed = 0;

function assert(name, ok, detail) {
  console.log(ok ? `  ✓ ${name}` : `  ✗ ${name} — ${detail}`);
  if (!ok) failed = 1;
}

function quoteLine(params) {
  let unitFood = resolveCartLineUnitFoodPrice({
    linePrice: params.linePrice,
    serverUnitBase: params.serverUnitBase,
    addonPerUnit: params.addonPerUnit,
    catalogFoodPrice: params.catalogFoodPrice,
  });
  unitFood = applyBundledAddonLinePriceRule({
    unitFood,
    linePrice: params.linePrice,
    addonPerUnit: params.addonPerUnit,
    hasAddonIds: params.addonPerUnit > 0,
    catalogFoodPrice: params.catalogFoodPrice,
  });
  const addonCost = params.addonPerUnit;
  const subtotal = roundOrderMoney(unitFood + addonCost - (params.restaurantDiscount ?? 0));
  const tax = roundOrderMoney((subtotal * TAX_PERCENT) / 100);
  return { unitFood, addonCost, subtotal, tax };
}

console.log('Order line pricing (quote / place-order shared logic)\n');

const classic = quoteLine({
  linePrice: 27,
  serverUnitBase: 23,
  addonPerUnit: 4,
  catalogFoodPrice: 19,
});
console.log('Input:  line price=27, addon=4, server food+var=23');
console.log(
  `Output: items_price=${classic.unitFood}, addon_cost=${classic.addonCost}, subtotal=${classic.subtotal}, tax_5%=${classic.tax}\n`
);
assert('items_price is 23 (not 27)', classic.unitFood === 23, `got ${classic.unitFood}`);
assert('subtotal is 27 (not 31)', classic.subtotal === 27, `got ${classic.subtotal}`);
assert('tax is 1.35 (not 1.55)', classic.tax === 1.35, `got ${classic.tax}`);

const serverEqualsClient = quoteLine({
  linePrice: 27,
  serverUnitBase: 27,
  addonPerUnit: 4,
  catalogFoodPrice: 19,
});
console.log('\nInput:  line price=27, addon=4, server food+var=27');
console.log(
  `Output: items_price=${serverEqualsClient.unitFood}, subtotal=${serverEqualsClient.subtotal}, tax_5%=${serverEqualsClient.tax}\n`
);
assert(
  'server=27 still strips to food 23',
  serverEqualsClient.unitFood === 23,
  `got ${serverEqualsClient.unitFood}`
);
assert('subtotal 27', serverEqualsClient.subtotal === 27, `got ${serverEqualsClient.subtotal}`);
assert('tax 1.35', serverEqualsClient.tax === 1.35, `got ${serverEqualsClient.tax}`);

const checkoutTest = quoteLine({
  linePrice: 100,
  serverUnitBase: 100,
  addonPerUnit: 20,
  catalogFoodPrice: 100,
  restaurantDiscount: 6,
});
assert(
  'checkout 100+20-6 → tax 5.70',
  checkoutTest.subtotal === 114 && checkoutTest.tax === 5.7,
  `sub ${checkoutTest.subtotal} tax ${checkoutTest.tax}`
);

const absoluteVariationsJson = JSON.stringify([
  {
    name: 'Size',
    type: 'single',
    values: [
      { label: 'Regular', optionPrice: 500 },
      { label: 'Large', optionPrice: 755.5 },
    ],
  },
]);
const unit755 = resolveCheckoutServerUnitBase({
  catalogBasePrice: 100,
  productVariationsJson: absoluteVariationsJson,
  selectedVariations: [{ name: 'Size', value: 'Large' }],
});
assert('absolute variation row → 755.5', unit755 === 755.5, `got ${unit755}`);
const multiProductSubtotal = roundOrderMoney(unit755 * 2);
const multiTax = roundOrderMoney((multiProductSubtotal * TAX_PERCENT) / 100);
assert(
  '2×755.5 → tax 75.55',
  multiProductSubtotal === 1511 && multiTax === 75.55,
  `sub ${multiProductSubtotal} tax ${multiTax}`
);

const dupVarJson = JSON.stringify([
  { name: 'Extra', type: 'single', values: [{ label: 'Add', optionPrice: 50 }] },
]);
const dupSelected = [
  { type: 'Extra', value: 'Add' },
  { name: 'Extra', type: 'single', values: ['Add'] },
];
assert('duplicate variation rows → charge once', computeVariationExtra(dupVarJson, dupSelected) === 50);
const unit555 = resolveCheckoutServerUnitBase({
  catalogBasePrice: 505.5,
  productVariationsJson: dupVarJson,
  selectedVariations: mergeCartLineVariations({
    variations: dupSelected,
    variation_options: dupSelected,
  }),
});
assert('505.5 + 50 → 555.5', unit555 === 555.5, `got ${unit555}`);
assert(
  '2×555.5 → tax 55.55',
  roundOrderMoney(555.5 * 2 * (TAX_PERCENT / 100)) === 55.55
);

const foodOnlyPrice = quoteLine({
  linePrice: 100,
  serverUnitBase: 100,
  addonPerUnit: 20,
  catalogFoodPrice: 100,
});
assert(
  'food-only line price 100 + addons 20',
  foodOnlyPrice.unitFood === 100 && foodOnlyPrice.subtotal === 120,
  `got food ${foodOnlyPrice.unitFood} sub ${foodOnlyPrice.subtotal}`
);

console.log(failed ? '\nFAILED' : '\nPASSED — pricing fix is live in this build');
process.exit(failed);
