/**
 * Run: npm run test:order-pricing
 * No DB — validates quote line math for the Flutter buy-now payload.
 */
import {
  applyBuyNowLineSubtotalPriceRule,
  resolveCartLineUnitFoodPrice,
  roundOrderMoney,
} from '../src/utils/consumer/orderLinePricing';

const TAX_PERCENT = 5;

function assert(name: string, ok: boolean, detail: string) {
  console.log(ok ? `  ✓ ${name}` : `  ✗ ${name} — ${detail}`);
  if (!ok) process.exitCode = 1;
}

console.log('Order line pricing (Flutter buy-now scenario)\n');

// From app logs: price 27, addons 4, server food+var 27 (food.price may be 27 or 19+var).
const unitFood = resolveCartLineUnitFoodPrice({
  linePrice: 27,
  serverUnitBase: 27,
  addonPerUnit: 4,
  catalogFoodPrice: 27,
});

const addonCost = 4;
const subtotal = roundOrderMoney(unitFood + addonCost);
const tax = roundOrderMoney((subtotal * TAX_PERCENT) / 100);

console.log('Input:  line price=27, addon_per_unit=4, server_unit_base=27');
console.log(`Output: items_price=${unitFood}, addon_cost=${addonCost}, subtotal=${subtotal}, tax_5%=${tax}\n`);

assert('items_price is 23 (not 27)', unitFood === 23, `got ${unitFood}`);
assert('subtotal is 27 (not 31)', subtotal === 27, `got ${subtotal}`);
assert('tax is 1.35 (not 1.55)', tax === 1.35, `got ${tax}`);

const unitFoodVar = applyBuyNowLineSubtotalPriceRule({
  unitFood: resolveCartLineUnitFoodPrice({
    linePrice: 27,
    serverUnitBase: 31,
    addonPerUnit: 4,
    catalogFoodPrice: 27,
  }),
  linePrice: 27,
  addonPerUnit: 4,
  hasAddonIds: true,
  isBuyNow: true,
});
assert('buy-now server 31 → items_price 23', unitFoodVar === 23, `got ${unitFoodVar}`);
assert(
  'prod-like server 31 → subtotal 27',
  roundOrderMoney(unitFoodVar + 4) === 27,
  `got ${roundOrderMoney(unitFoodVar + 4)}`
);

const foodOnly = resolveCartLineUnitFoodPrice({
  linePrice: 23,
  serverUnitBase: 27,
  addonPerUnit: 4,
  catalogFoodPrice: 23,
});
assert('food-only price 23 stays 23', foodOnly === 23, `got ${foodOnly}`);

console.log(process.exitCode === 1 ? '\nFAILED' : '\nPASSED — safe to hand to developer / deploy');
