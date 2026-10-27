/**
 * Same checks as test-order-line-pricing.ts — runs on server after `npm run build` (no ts-node).
 */
const {
  resolveCartLineUnitFoodPrice,
  roundOrderMoney,
} = require('../dist/utils/consumer/orderLinePricing');

const TAX_PERCENT = 5;
let failed = 0;

function assert(name, ok, detail) {
  console.log(ok ? `  ✓ ${name}` : `  ✗ ${name} — ${detail}`);
  if (!ok) failed = 1;
}

console.log('Order line pricing (Flutter buy-now scenario)\n');

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

console.log(failed ? '\nFAILED' : '\nPASSED — pricing fix is live in this build');
process.exit(failed);
