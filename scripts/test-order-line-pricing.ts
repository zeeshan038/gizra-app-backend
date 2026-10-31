/**
 * Run: npm run test:order-pricing
 * No DB — validates quote line math for the Flutter buy-now payload.
 */
import {
  applyBundledAddonLinePriceRule,
  resolveCartLineUnitFoodPrice,
  roundOrderMoney,
} from '../src/utils/consumer/orderLinePricing';

const TAX_PERCENT = 5;

function assert(name: string, ok: boolean, detail: string) {
  console.log(ok ? `  ✓ ${name}` : `  ✗ ${name} — ${detail}`);
  if (!ok) process.exitCode = 1;
}

function quoteLine(params: {
  linePrice: number;
  serverUnitBase: number;
  addonPerUnit: number;
  catalogFoodPrice: number;
  restaurantDiscount?: number;
}) {
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
  const subtotal = roundOrderMoney(
    unitFood + addonCost - (params.restaurantDiscount ?? 0)
  );
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
console.log('\nInput:  line price=27, addon=4, server food+var=27 (bundled double-count)');
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

const foodOnlyPrice = quoteLine({
  linePrice: 100,
  serverUnitBase: 100,
  addonPerUnit: 20,
  catalogFoodPrice: 100,
});
assert(
  'food-only line price 100 + separate addons 20 stays 100+20',
  foodOnlyPrice.unitFood === 100 && foodOnlyPrice.subtotal === 120,
  `got food ${foodOnlyPrice.unitFood} sub ${foodOnlyPrice.subtotal}`
);
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

const underpricedClient = resolveCartLineUnitFoodPrice({
  linePrice: 3,
  serverUnitBase: 48,
  addonPerUnit: 0,
  catalogFoodPrice: 45,
});
assert(
  'client underprice (topping only) → catalog 48',
  underpricedClient === 48,
  `got ${underpricedClient}`
);

console.log(process.exitCode === 1 ? '\nFAILED' : '\nPASSED — safe to hand to developer / deploy');
